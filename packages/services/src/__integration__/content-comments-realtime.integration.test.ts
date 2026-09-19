import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createContentCommentCore,
  deleteContentCommentCore,
  setContentCommentLikeCore,
} from "../content/contentEngagementCore";
import { createContentPostCore } from "../content/contentPostCore";
import { resetContentSettingsCache } from "../content/contentProgram";
import {
  type TestUser,
  createSessionClient,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Comments in real time (migration 20260919090000): database triggers
// broadcast comment inserts, updates (likes, deletion) and the post's
// counters on the private topic `content_post:<id>`; only signed-in
// accounts may join, only for a published, visible post; comment bodies
// never ride the channel.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["content_program_setting"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;
let author: TestUser;
let commenter: TestUser;
let watcher: TestUser;
let original: SettingsRow;
let postId: string;
let draftId: string;
let eventId: string;
const channels: RealtimeChannel[] = [];
const sessions = new Map<string, SupabaseClient<Database>>();

async function sessionFor(user: TestUser) {
  let client = sessionFor.cache.get(user.id);
  if (!client) {
    client = await createSessionClient(user);
    sessionFor.cache.set(user.id, client);
    sessions.set(user.id, client);
  }
  return client;
}
sessionFor.cache = new Map<string, SupabaseClient<Database>>();

function subscribe(channel: RealtimeChannel): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 20_000);
    channel.subscribe((status) => {
      if (["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
}

function next(
  channel: RealtimeChannel,
  event: string,
  timeoutMs = 20_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no ${event} within ${timeoutMs}ms`)),
      timeoutMs,
    );
    channel.on("broadcast", { event }, ({ payload }) => {
      clearTimeout(timer);
      resolve(payload as Record<string, unknown>);
    });
  });
}

async function join(user: TestUser, topic: string) {
  const ch = (await sessionFor(user)).channel(topic, {
    config: { private: true },
  });
  channels.push(ch);
  return ch;
}

async function makePost(publish: boolean) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const { data: media } = await svc
    .from("content_media")
    .insert({
      owner_id: author.id,
      media_type: "image",
      public_id: `content_media/development/${author.id}/rt_${token}`,
      version: 1,
      bytes: 1000,
      width: 720,
      height: 1280,
      media_url: `https://res.cloudinary.com/demo/image/upload/rt_${token}`,
      thumbnail_url: `https://res.cloudinary.com/demo/image/upload/rt_${token}.jpg`,
      status: "ready",
      playback_status: "none",
    } as never)
    .select("id")
    .single();
  const res = await createContentPostCore(svc, author.id, {
    kind: "spotlight",
    publisher: { kind: "organizer", placeId: null },
    mediaIds: [(media as { id: string }).id],
    caption: "Realtime test",
    hashtags: [],
    eventId: null,
    placeId: null,
    allowComments: true,
    allowDownload: false,
    rightsAcknowledged: true,
    publish,
  });
  expect(res.status, res.message).toBe(200);
  return (res.data as { id: string }).id;
}

beforeAll(async () => {
  const { data } = await svc
    .from("content_program_setting")
    .select("*")
    .eq("id", 1)
    .single();
  original = data as SettingsRow;
  const service = getServiceClient();
  author = await createTestUser(service);
  commenter = await createTestUser(service);
  watcher = await createTestUser(service);
  await svc.from("admin_user").upsert(
    [author, commenter, watcher].map((u) => ({
      user_id: u.id,
      status: "active",
    })) as never,
  );
  await svc
    .from("content_program_setting")
    .update({
      spotlight_enabled: true,
      spotlight_audience: "staff",
      spotlight_posting_enabled: true,
      spotlight_comments_enabled: true,
      creator_posting_enabled: true,
    } as never)
    .eq("id", 1);
  resetContentSettingsCache();
  // Posting is for organizers: give the author a published event.
  const fixture = await createTestEventWithTicketType(service, author.id, {
    quantity: 5,
  });
  eventId = fixture.eventId;
  await svc
    .from("event")
    .update({ status: "published" } as never)
    .eq("id", eventId);
  postId = await makePost(true);
  draftId = await makePost(false);
}, 60_000);

afterEach(async () => {
  for (const ch of channels.splice(0)) {
    try {
      await ch.unsubscribe();
    } catch {
      /* ignore */
    }
  }
});

afterAll(async () => {
  for (const c of sessions.values()) c.realtime.disconnect();
  await svc
    .from("content_program_setting")
    .update(original as never)
    .eq("id", 1);
  resetContentSettingsCache();
  await svc.from("content_post").delete().in("id", [postId, draftId]);
  await svc.from("content_media").delete().eq("owner_id", author.id);
  if (eventId) await svc.from("event").delete().eq("id", eventId);
  await svc
    .from("admin_user")
    .delete()
    .in("user_id", [author.id, commenter.id, watcher.id]);
  const service = getServiceClient();
  for (const u of [author, commenter, watcher]) {
    if (u) await deleteTestUser(service, u.id);
  }
});

describe("content comments realtime", () => {
  it("broadcasts a new comment as ids only, then the post's counters", async () => {
    const ch = await join(watcher, `content_post:${postId}`);
    const gotInsert = next(ch, "comment_insert");
    const gotCounts = next(ch, "post_counts");
    expect(await subscribe(ch)).toBe("SUBSCRIBED");

    const body = "Is this on every Friday?";
    const res = await createContentCommentCore(svc, commenter.id, {
      postId,
      body,
    });
    expect(res.status, res.message).toBe(200);

    const insert = await gotInsert;
    expect(insert).toMatchObject({
      id: res.data?.id,
      post_id: postId,
      parent_id: null,
      author_id: commenter.id,
    });
    expect(JSON.stringify(insert)).not.toContain(body);
    expect(await gotCounts).toMatchObject({ post_id: postId, comments: 1 });
  }, 90_000);

  it("broadcasts a like count and a deletion to everyone on the post", async () => {
    const res = await createContentCommentCore(svc, commenter.id, {
      postId,
      body: "Second",
    });
    const commentId = res.data?.id as string;

    const ch = await join(watcher, `content_post:${postId}`);
    const gotLike = next(ch, "comment_update");
    expect(await subscribe(ch)).toBe("SUBSCRIBED");
    await setContentCommentLikeCore(svc, author.id, {
      commentId,
      liked: true,
    });
    expect(await gotLike).toMatchObject({
      id: commentId,
      visible: true,
      like_count: 1,
    });

    const ch2 = await join(author, `content_post:${postId}`);
    const gotDelete = next(ch2, "comment_update");
    expect(await subscribe(ch2)).toBe("SUBSCRIBED");
    await deleteContentCommentCore(svc, commenter.id, commentId);
    expect(await gotDelete).toMatchObject({ id: commentId, visible: false });
  }, 90_000);

  it("refuses to let anyone join a draft's topic", async () => {
    const ch = await join(watcher, `content_post:${draftId}`);
    const status = await subscribe(ch).catch(() => "TIMED_OUT");
    expect(status).not.toBe("SUBSCRIBED");
  }, 60_000);
});
