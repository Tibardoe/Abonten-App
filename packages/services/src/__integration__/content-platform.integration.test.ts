import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createContentCommentCore,
  deleteContentCommentCore,
  listContentCommentsCore,
  recordContentShareCore,
  setContentCommentLikeCore,
  setContentLikeCore,
  setContentReactionCore,
  setNotInterestedCore,
} from "../content/contentEngagementCore";
import { getContentFeedCore } from "../content/contentFeedCore";
import {
  createContentPostCore,
  getContentPostCore,
} from "../content/contentPostCore";
import {
  resetContentSettingsCache,
  resolveContentAccess,
} from "../content/contentProgram";
import { ingestContentViewsCore } from "../content/contentTelemetryCore";
import { setFollowCore } from "../content/followCore";
import { getStoryTrayCore, setStoryMuteCore } from "../content/storiesCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Spotlight + Stories against a real local stack (migrations
// 20260916120000..120300): the access boundary on the new tables and
// functions, the programme switch and audiences, publishing rules, feed
// visibility (moderation, blocks, not-interested), idempotent engagement,
// follows and the Story tray, telemetry de-duplication and moderation
// notices. Promotions are covered by content-promotions.integration.test.ts.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["content_program_setting"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;
const anon = createClient<Database>(
  process.env.SUPABASE_TEST_URL as string,
  process.env.SUPABASE_TEST_ANON_KEY as string,
  { auth: { persistSession: false } },
);
const IP = { ip: "203.0.113.7" };

let organizer: TestUser;
let viewer: TestUser;
let stranger: TestUser;
let original: SettingsRow;
let eventId: string;
const postIds: string[] = [];

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Expected a value");
  return value;
}

async function setSettings(patch: Partial<SettingsRow>) {
  const { error } = await svc
    .from("content_program_setting")
    .update(patch as never)
    .eq("id", 1);
  expect(error).toBeNull();
  resetContentSettingsCache();
}

async function makeMedia(ownerId: string, type: "image" | "video" = "image") {
  const token = crypto.randomUUID().replace(/-/g, "");
  const { data, error } = await svc
    .from("content_media")
    .insert({
      owner_id: ownerId,
      media_type: type,
      public_id: `content_media/${ownerId}/it_${token}`,
      version: 1,
      bytes: 1000,
      width: 720,
      height: 1280,
      duration_seconds: type === "video" ? 12 : null,
      media_url: `https://res.cloudinary.com/demo/${type}/upload/it_${token}`,
      thumbnail_url: `https://res.cloudinary.com/demo/image/upload/it_${token}.jpg`,
      status: "ready",
      playback_status: "none",
    } as never)
    .select("id")
    .single();
  expect(error).toBeNull();
  return must(data).id as string;
}

async function publishPost(
  kind: "spotlight" | "story",
  extra: { caption?: string; eventId?: string | null } = {},
) {
  const mediaId = await makeMedia(organizer.id);
  const res = await createContentPostCore(svc, organizer.id, {
    kind,
    publisher: { kind: "organizer", placeId: null },
    mediaIds: [mediaId],
    caption: extra.caption ?? `IT ${kind} ${crypto.randomUUID().slice(0, 6)}`,
    hashtags: [],
    eventId: extra.eventId ?? null,
    placeId: null,
    allowComments: true,
    allowDownload: false,
    rightsAcknowledged: true,
    publish: true,
  });
  expect(res.status, res.message).toBe(200);
  const id = must(res.data).id;
  postIds.push(id);
  return id;
}

beforeAll(async () => {
  const { data } = await svc
    .from("content_program_setting")
    .select("*")
    .eq("id", 1)
    .single();
  original = must(data) as SettingsRow;

  organizer = await createTestUser(svc as never);
  viewer = await createTestUser(svc as never);
  stranger = await createTestUser(svc as never);
  const fixture = await createTestEventWithTicketType(
    svc as never,
    organizer.id,
    {
      quantity: 20,
    },
  );
  eventId = fixture.eventId;
  await svc
    .from("event")
    .update({ status: "published" } as never)
    .eq("id", eventId);
  // The organizer and viewer are staff for the "staff" audience.
  await svc.from("admin_user").upsert([
    { user_id: organizer.id, status: "active" },
    { user_id: viewer.id, status: "active" },
  ] as never);
});

afterAll(async () => {
  await setSettings(original);
  if (postIds.length) {
    await svc.from("content_campaign").delete().in("post_id", postIds);
    await svc.from("content_post").delete().in("id", postIds);
  }
  await svc.from("content_media").delete().eq("owner_id", organizer.id);
  await svc
    .from("admin_user")
    .delete()
    .in("user_id", [organizer.id, viewer.id]);
  await svc.from("event").delete().eq("id", eventId);
  for (const u of [organizer, viewer, stranger]) {
    await deleteTestUser(svc as never, u.id);
  }
});

beforeEach(async () => {
  await setSettings({
    spotlight_enabled: true,
    spotlight_audience: "staff",
    spotlight_posting_enabled: true,
    spotlight_comments_enabled: true,
    spotlight_promotions_enabled: true,
    stories_enabled: true,
    stories_audience: "staff",
    stories_posting_enabled: true,
    stories_comments_enabled: true,
    stories_reactions_enabled: true,
    stories_sharing_enabled: true,
    creator_posting_enabled: true,
    beta_user_ids: [],
  } as Partial<SettingsRow>);
});

describe("access boundary", () => {
  it("gives clients no direct writes to content tables", async () => {
    const tries = await Promise.all([
      viewer.client.from("follow").insert({
        follower_id: viewer.id,
        target_kind: "organizer",
        target_id: organizer.id,
      } as never),
      viewer.client
        .from("content_post")
        .insert({ author_id: viewer.id, kind: "spotlight" } as never),
      viewer.client
        .from("content_campaign_ledger")
        .insert({ amount_minor: 1 } as never),
    ]);
    for (const t of tries) expect(t.error).not.toBeNull();
  });

  it("keeps money and publishing functions service-role only", async () => {
    const publish = await viewer.client.rpc("content_post_publish", {
      p_post_id: crypto.randomUUID(),
      p_actor_id: viewer.id,
    } as never);
    expect(publish.error).not.toBeNull();
    const transition = await anon.rpc("content_campaign_transition", {
      p_campaign_id: crypto.randomUUID(),
      p_to: "active",
      p_actor_id: viewer.id,
      p_actor_kind: "admin",
      p_reason: "x",
    } as never);
    expect(transition.error).not.toBeNull();
    const trigger = await viewer.client.rpc("_content_counter_touch" as never);
    expect(trigger.error).not.toBeNull();
  });

  it("never shows drafts to other people through RLS", async () => {
    const mediaId = await makeMedia(organizer.id);
    const draft = await createContentPostCore(svc, organizer.id, {
      kind: "spotlight",
      publisher: { kind: "organizer", placeId: null },
      mediaIds: [mediaId],
      caption: "draft",
      hashtags: [],
      allowComments: true,
      allowDownload: false,
      rightsAcknowledged: true,
      publish: false,
    });
    expect(draft.status).toBe(200);
    const id = must(draft.data).id;
    postIds.push(id);
    const { data } = await viewer.client
      .from("content_post")
      .select("id")
      .eq("id", id);
    expect(data ?? []).toHaveLength(0);
    const own = await organizer.client
      .from("content_post")
      .select("id")
      .eq("id", id);
    expect(own.data ?? []).toHaveLength(1);
  });
});

describe("programme switch", () => {
  it("fails closed when off and follows the audience when on", async () => {
    await setSettings({ spotlight_enabled: false, stories_enabled: false });
    const off = await resolveContentAccess(svc, viewer.id);
    expect(off.program.spotlight).toBe(false);
    expect(off.program.stories).toBe(false);

    await setSettings({ spotlight_enabled: true, spotlight_audience: "staff" });
    expect((await resolveContentAccess(svc, viewer.id)).program.spotlight).toBe(
      true,
    );
    expect(
      (await resolveContentAccess(svc, stranger.id)).program.spotlight,
    ).toBe(false);
    expect((await resolveContentAccess(svc, null)).program.spotlight).toBe(
      false,
    );

    await setSettings({
      spotlight_audience: "beta",
      beta_user_ids: [stranger.id],
    });
    expect(
      (await resolveContentAccess(svc, stranger.id)).program.spotlight,
    ).toBe(true);
  });

  it("lets the kill switch win over the settings row", async () => {
    process.env.SPOTLIGHT_KILL_SWITCH = "true";
    try {
      expect(
        (await resolveContentAccess(svc, viewer.id)).program.spotlight,
      ).toBe(false);
    } finally {
      Reflect.deleteProperty(process.env, "SPOTLIGHT_KILL_SWITCH");
    }
  });

  it("only lets eligible people post", async () => {
    const organizerAccess = await resolveContentAccess(svc, organizer.id);
    expect(organizerAccess.program.canPublish).toBe(true);
    const strangerMedia = await makeMedia(stranger.id);
    await setSettings({ spotlight_audience: "all" });
    const refused = await createContentPostCore(svc, stranger.id, {
      kind: "spotlight",
      publisher: { kind: "organizer", placeId: null },
      mediaIds: [strangerMedia],
      hashtags: [],
      allowComments: true,
      allowDownload: false,
      rightsAcknowledged: true,
      publish: true,
    });
    expect(refused.status).toBe(403);
    await svc.from("content_media").delete().eq("id", strangerMedia);
  });
});

describe("publishing and the feed", () => {
  it("publishes a Spotlight that a staff viewer sees in For you", async () => {
    const id = await publishPost("spotlight", { eventId });
    const feed = await getContentFeedCore(
      svc,
      viewer.id,
      { surface: "for_you", viewerKey: `it-viewer-${viewer.id}` },
      IP,
    );
    expect(feed.status).toBe(200);
    const item = must(feed.data).items.find((i) => i.post.id === id);
    expect(item).toBeTruthy();
    expect(item?.post.event?.id).toBe(eventId);
    expect(item?.post.event?.available).toBe(true);
  });

  it("drops a post from the feed after Not interested, a block or moderation", async () => {
    const id = await publishPost("spotlight");
    const inFeed = async (userId: string) => {
      const res = await getContentFeedCore(
        svc,
        userId,
        { surface: "for_you", viewerKey: `it-${userId}` },
        IP,
      );
      return must(res.data).items.some((i) => i.post.id === id);
    };

    expect(await inFeed(viewer.id)).toBe(true);
    await setNotInterestedCore(svc, viewer.id, {
      postId: id,
      notInterested: true,
    });
    expect(await inFeed(viewer.id)).toBe(false);
    await setNotInterestedCore(svc, viewer.id, {
      postId: id,
      notInterested: false,
    });
    expect(await inFeed(viewer.id)).toBe(true);

    await svc
      .from("conversation_block")
      .insert({ blocker_id: viewer.id, blocked_id: organizer.id } as never);
    expect(await inFeed(viewer.id)).toBe(false);
    await svc
      .from("conversation_block")
      .delete()
      .eq("blocker_id", viewer.id)
      .eq("blocked_id", organizer.id);

    const { error } = await svc.rpc("apply_moderation_action", {
      p_actor_id: viewer.id,
      p_target_type: "spotlight",
      p_target_id: id,
      p_action: "hide",
      p_reason: "integration test",
      p_report_id: null,
      p_idempotency_key: `it:${id}:hide`,
    } as never);
    expect(error).toBeNull();
    expect(await inFeed(viewer.id)).toBe(false);
    const direct = await getContentPostCore(svc, viewer.id, id);
    expect(direct.status).toBe(404);
  });
});

describe("engagement", () => {
  it("keeps likes, reactions and comments idempotent with correct counters", async () => {
    const id = await publishPost("spotlight");
    await setContentLikeCore(svc, viewer.id, { postId: id, liked: true });
    const again = await setContentLikeCore(svc, viewer.id, {
      postId: id,
      liked: true,
    });
    expect(must(again.data).counts.likes).toBe(1);
    const off = await setContentLikeCore(svc, viewer.id, {
      postId: id,
      liked: false,
    });
    expect(must(off.data).counts.likes).toBe(0);

    const comment = await createContentCommentCore(svc, viewer.id, {
      postId: id,
      body: "Looks great",
    });
    expect(comment.status).toBe(200);
    let { data: row } = await svc
      .from("content_post")
      .select("comment_count")
      .eq("id", id)
      .single();
    expect(must(row).comment_count).toBe(1);
    // The post's author may remove a comment on their own post.
    const removed = await deleteContentCommentCore(
      svc,
      organizer.id,
      must(comment.data).id,
    );
    expect(removed.status).toBe(200);
    ({ data: row } = await svc
      .from("content_post")
      .select("comment_count")
      .eq("id", id)
      .single());
    expect(must(row).comment_count).toBe(0);

    const strangerDelete = await deleteContentCommentCore(
      svc,
      stranger.id,
      must(comment.data).id,
    );
    expect(strangerDelete.status).not.toBe(200);
  });

  it("replaces a Story reaction instead of adding a second one", async () => {
    const id = await publishPost("story");
    await setContentReactionCore(svc, viewer.id, { postId: id, emoji: "🔥" });
    await setContentReactionCore(svc, viewer.id, { postId: id, emoji: "😍" });
    const { data } = await svc
      .from("content_reaction")
      .select("emoji")
      .eq("post_id", id)
      .eq("user_id", viewer.id);
    expect(data).toEqual([{ emoji: "😍" }]);
  });

  it("refuses comments when the programme turns them off", async () => {
    const id = await publishPost("spotlight");
    await setSettings({ spotlight_comments_enabled: false });
    const res = await createContentCommentCore(svc, viewer.id, {
      postId: id,
      body: "hello",
    });
    expect(res.status).toBe(403);
  });
});

describe("follows, the Story tray and telemetry", () => {
  it("shows a followed publisher's Story as unseen, then seen after a view", async () => {
    const id = await publishPost("story");
    const follow = await setFollowCore(svc, viewer.id, {
      targetKind: "organizer",
      targetId: organizer.id,
      following: true,
    });
    expect(follow.status).toBe(200);
    expect(must(follow.data).following).toBe(true);
    const twice = await setFollowCore(svc, viewer.id, {
      targetKind: "organizer",
      targetId: organizer.id,
      following: true,
    });
    expect(must(twice.data).followerCount).toBe(
      must(follow.data).followerCount,
    );

    let tray = must((await getStoryTrayCore(svc, viewer.id)).data);
    let entry = tray.entries.find((e) => e.publisher.id === organizer.id);
    expect(entry?.hasUnseen).toBe(true);
    expect(entry?.storyIds).toContain(id);

    const views = await ingestContentViewsCore(
      svc,
      viewer.id,
      {
        viewerKey: `it-viewer-${viewer.id}`,
        // Every live Story from this publisher, including ones earlier tests
        // posted, so the whole tray entry becomes seen.
        events: (entry?.storyIds ?? [id]).map((storyId) => ({
          postId: storyId,
          kind: "view_start" as const,
          watchedMs: 1500,
          surface: "stories" as const,
        })),
      },
      IP,
    );
    expect(views.status).toBe(200);
    tray = must((await getStoryTrayCore(svc, viewer.id)).data);
    entry = tray.entries.find((e) => e.publisher.id === organizer.id);
    expect(entry?.hasUnseen).toBe(false);

    await setStoryMuteCore(svc, viewer.id, {
      publisherKind: "organizer",
      publisherId: organizer.id,
      muted: true,
    });
    tray = must((await getStoryTrayCore(svc, viewer.id)).data);
    entry = tray.entries.find((e) => e.publisher.id === organizer.id);
    expect(entry?.muted ?? true).toBe(true);
    await setStoryMuteCore(svc, viewer.id, {
      publisherKind: "organizer",
      publisherId: organizer.id,
      muted: false,
    });
  });

  it("answers an ended Story with 410 and the publisher", async () => {
    const id = await publishPost("story");
    await svc
      .from("content_post")
      .update({
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      } as never)
      .eq("id", id);
    const res = await getContentPostCore(svc, viewer.id, id);
    expect(res.status).toBe(410);
    if (res.status === 410) {
      expect(res.data.publisher?.id).toBe(organizer.id);
    }
    const tray = must((await getStoryTrayCore(svc, viewer.id)).data);
    const entry = tray.entries.find((e) => e.publisher.id === organizer.id);
    expect(entry?.storyIds ?? []).not.toContain(id);
  });

  it("counts a meaningful view once per viewer and skips unknown posts", async () => {
    const id = await publishPost("spotlight");
    const send = () =>
      ingestContentViewsCore(
        svc,
        viewer.id,
        {
          viewerKey: `it-dedupe-${viewer.id}`,
          events: [
            {
              postId: id,
              kind: "meaningful_view",
              watchedMs: 5000,
              surface: "for_you",
            },
            {
              postId: crypto.randomUUID(),
              kind: "meaningful_view",
              watchedMs: 5000,
              surface: "for_you",
            },
          ],
        },
        IP,
      );
    const first = must((await send()).data);
    // An id that is not a post is dropped without a stored row.
    expect(first.accepted).toBe(1);
    await send();
    const { data } = await svc
      .from("content_post")
      .select("view_count")
      .eq("id", id)
      .single();
    expect(must(data).view_count).toBe(1);
  });
});

describe("moderation notices", () => {
  it("tells the author when their Spotlight is removed", async () => {
    const id = await publishPost("spotlight");
    const { applyModerationActionCore } = await import(
      "../admin/moderation/applyModerationActionCore"
    );
    const res = await applyModerationActionCore(
      svc,
      {
        userId: viewer.id,
        email: viewer.email,
        roles: ["super_admin"],
        permissions: ["moderation.remove"],
        reauthenticatedAt: null,
      } as never,
      {
        targetType: "spotlight",
        targetId: id,
        action: "remove",
        reason: "test",
      },
    );
    expect(res.status).toBe(200);
    const { data } = await svc
      .from("notification")
      .select("type, data")
      .eq("user_id", organizer.id)
      .eq("type", "content_moderation");
    expect(
      (data ?? []).some((n) => (n.data as { postId?: string })?.postId === id),
    ).toBe(true);
  });
});

describe("pre-merge hardening", () => {
  it("hides comments from blocked people and when Spotlight is off, and guards comment likes", async () => {
    const id = await publishPost("spotlight");
    const c = await createContentCommentCore(svc, organizer.id, {
      postId: id,
      body: "Doors open at eight",
    });
    expect(c.status).toBe(200);
    const commentId = must(c.data).id;

    expect(
      (await listContentCommentsCore(svc, viewer.id, { postId: id })).status,
    ).toBe(200);

    await svc
      .from("conversation_block")
      .insert({ blocker_id: organizer.id, blocked_id: viewer.id } as never);
    try {
      expect(
        (await listContentCommentsCore(svc, viewer.id, { postId: id })).status,
      ).toBe(404);
      expect(
        (
          await setContentCommentLikeCore(svc, viewer.id, {
            commentId,
            liked: true,
          })
        ).status,
      ).toBe(403);
    } finally {
      await svc
        .from("conversation_block")
        .delete()
        .eq("blocker_id", organizer.id)
        .eq("blocked_id", viewer.id);
    }

    expect(
      (
        await setContentCommentLikeCore(svc, viewer.id, {
          commentId,
          liked: true,
        })
      ).status,
    ).toBe(200);
    await svc
      .from("content_post")
      .update({ moderation_state: "removed" } as never)
      .eq("id", id);
    expect(
      (
        await setContentCommentLikeCore(svc, viewer.id, {
          commentId,
          liked: false,
        })
      ).status,
    ).toBe(404);
    await svc
      .from("content_post")
      .update({ moderation_state: "visible" } as never)
      .eq("id", id);

    await setSettings({ spotlight_enabled: false });
    expect(
      (await listContentCommentsCore(svc, stranger.id, { postId: id })).status,
    ).toBe(403);
  });

  it("limits signed-out shares per network address", async () => {
    await setSettings({ spotlight_audience: "all" });
    const id = await publishPost("spotlight");
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
    const results: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await recordContentShareCore(
        svc,
        null,
        { postId: id, channel: "copy_link" } as never,
        { ip },
      );
      results.push(res.status);
    }
    expect(results.slice(0, 10).every((r) => r === 200)).toBe(true);
    expect(results[10]).toBe(429);
  });

  it("tells the card an attached event is sold out or over", async () => {
    const id = await publishPost("spotlight", { eventId });
    const read = async () => {
      const res = await getContentPostCore(svc, viewer.id, id);
      expect(res.status).toBe(200);
      return res.status === 200 ? res.data.post.event : null;
    };
    expect((await read())?.soldOut).toBe(false);

    const { data: types } = await svc
      .from("ticket_type")
      .select("id, quantity")
      .eq("event_id", eventId);
    await svc
      .from("ticket_type")
      .update({ quantity: 0 } as never)
      .eq("event_id", eventId);
    const soldOut = await read();
    expect(soldOut?.soldOut).toBe(true);
    expect(soldOut?.available).toBe(true);
    for (const t of types ?? []) {
      await svc
        .from("ticket_type")
        .update({ quantity: t.quantity } as never)
        .eq("id", t.id);
    }

    const { data: ev } = await svc
      .from("event")
      .select("starts_at, ends_at")
      .eq("id", eventId)
      .single();
    const { data: occ } = await svc
      .from("event_occurrence")
      .select("id, starts_at, ends_at")
      .eq("event_id", eventId);
    const past = {
      starts_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      ends_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    };
    await svc
      .from("event")
      .update(past as never)
      .eq("id", eventId);
    await svc
      .from("event_occurrence")
      .update(past as never)
      .eq("event_id", eventId);
    try {
      const over = await read();
      expect(over?.ended).toBe(true);
      expect(over?.available).toBe(false);
    } finally {
      await svc
        .from("event")
        .update(must(ev) as never)
        .eq("id", eventId);
      for (const o of occ ?? []) {
        await svc
          .from("event_occurrence")
          .update({ starts_at: o.starts_at, ends_at: o.ends_at } as never)
          .eq("id", o.id);
      }
    }
  });

  it("keeps a Story visible until its database expiry and drops it the moment after", async () => {
    const id = await publishPost("story");
    await setFollowCore(svc, viewer.id, {
      targetKind: "organizer",
      targetId: organizer.id,
      following: true,
    });
    await svc
      .from("content_post")
      .update({
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      } as never)
      .eq("id", id);
    expect((await getContentPostCore(svc, viewer.id, id)).status).toBe(200);
    let tray = must((await getStoryTrayCore(svc, viewer.id)).data);
    expect(tray.entries.some((e) => e.storyIds.includes(id))).toBe(true);

    await svc
      .from("content_post")
      .update({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      } as never)
      .eq("id", id);
    expect((await getContentPostCore(svc, viewer.id, id)).status).toBe(410);
    tray = must((await getStoryTrayCore(svc, viewer.id)).data);
    expect(tray.entries.some((e) => e.storyIds.includes(id))).toBe(false);

    // A suspended author's live Stories disappear too.
    const live = await publishPost("story");
    await svc
      .from("user_info")
      .update({ status_id: 2 } as never)
      .eq("id", organizer.id);
    try {
      tray = must((await getStoryTrayCore(svc, viewer.id)).data);
      expect(tray.entries.some((e) => e.storyIds.includes(live))).toBe(false);
      expect((await getContentPostCore(svc, viewer.id, live)).status).not.toBe(
        200,
      );
    } finally {
      await svc
        .from("user_info")
        .update({ status_id: 1 } as never)
        .eq("id", organizer.id);
    }
  });

  it("keeps Follow separate from Notify me and from muting", async () => {
    expect(
      (
        await setFollowCore(svc, viewer.id, {
          targetKind: "organizer",
          targetId: viewer.id,
          following: true,
        })
      ).status,
    ).toBe(400);

    const countSubs = async () =>
      (
        await svc
          .from("notification_subscription")
          .select("id", { count: "exact", head: true })
          .eq("user_id", viewer.id)
      ).count;
    const before = await countSubs();
    const on = await setFollowCore(svc, viewer.id, {
      targetKind: "organizer",
      targetId: organizer.id,
      following: true,
    });
    expect(must(on.data).following).toBe(true);
    expect(await countSubs()).toBe(before);

    await setStoryMuteCore(svc, viewer.id, {
      publisherKind: "organizer",
      publisherId: organizer.id,
      muted: true,
    });
    const { data: still } = await svc
      .from("follow")
      .select("id")
      .eq("follower_id", viewer.id)
      .eq("target_id", organizer.id);
    expect(still).toHaveLength(1);
    await setStoryMuteCore(svc, viewer.id, {
      publisherKind: "organizer",
      publisherId: organizer.id,
      muted: false,
    });

    // Suspended people can't follow, and nobody can follow a suspended one.
    await svc
      .from("user_info")
      .update({ status_id: 2 } as never)
      .eq("id", stranger.id);
    try {
      expect(
        (
          await setFollowCore(svc, stranger.id, {
            targetKind: "organizer",
            targetId: organizer.id,
            following: true,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await setFollowCore(svc, viewer.id, {
            targetKind: "organizer",
            targetId: stranger.id,
            following: true,
          })
        ).status,
      ).toBe(404);
    } finally {
      await svc
        .from("user_info")
        .update({ status_id: 1 } as never)
        .eq("id", stranger.id);
    }
  });
});
