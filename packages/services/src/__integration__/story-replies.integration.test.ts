import { readStoryReplyContext } from "@abonten/core/content/storyReply";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createContentPostCore } from "../content/contentPostCore";
import { resetContentSettingsCache } from "../content/contentProgram";
import { sendStoryReplyCore } from "../content/storyReplyCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Story replies land in Messages (migration 20260917120000): a reply to an
// organizer's Story opens ONE direct conversation per pair, a reply to a
// place's Story reuses the viewer's place conversation, every message
// carries its Story in system_data.story_reply, and the invariants a client
// could bypass (live Story, not your own, replies allowed, blocks, Abonten
// Stories) are refused in the database as well as in the service.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["content_program_setting"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;

let organizer: TestUser;
let viewer: TestUser;
let original: SettingsRow;
let placeId: string;
const postIds: string[] = [];
const conversationIds = new Set<string>();

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

async function publishStory(
  publisher: { kind: "organizer" | "place"; placeId: string | null },
  allowComments = true,
) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const { data: media, error } = await svc
    .from("content_media")
    .insert({
      owner_id: organizer.id,
      media_type: "image",
      public_id: `content_media/development/${organizer.id}/it_${token}`,
      version: 1,
      bytes: 1000,
      width: 720,
      height: 1280,
      media_url: `https://res.cloudinary.com/demo/image/upload/it_${token}`,
      thumbnail_url: `https://res.cloudinary.com/demo/image/upload/it_${token}.jpg`,
      status: "ready",
      playback_status: "none",
    } as never)
    .select("id")
    .single();
  expect(error).toBeNull();
  const res = await createContentPostCore(svc, organizer.id, {
    kind: "story",
    publisher,
    mediaIds: [must(media).id as string],
    caption: "IT story",
    hashtags: [],
    eventId: null,
    placeId: null,
    allowComments,
    allowDownload: false,
    rightsAcknowledged: true,
    publish: true,
  });
  expect(res.status, res.message).toBe(200);
  const id = must(res.data).id;
  postIds.push(id);
  return id;
}

async function reply(
  postId: string,
  content: string,
  kind: "text" | "reaction" = "text",
  clientGeneratedId: string | null = null,
) {
  const res = await sendStoryReplyCore(svc, viewer.client, viewer.id, {
    postId,
    kind,
    content,
    clientGeneratedId,
  });
  if (res.data) conversationIds.add(res.data.conversationId);
  return res;
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
  await svc.from("admin_user").upsert([
    { user_id: organizer.id, status: "active" },
    { user_id: viewer.id, status: "active" },
  ] as never);
  const { data: place, error } = await svc
    .from("place")
    .insert({
      country_code: "GH",
      timezone: "Africa/Accra",
      owner_id: organizer.id,
      name: "Story Reply Lounge",
      slug: `story-reply-lounge-${crypto.randomUUID()}`,
      description: "Integration test place",
      category_id: 1,
      location: "SRID=4326;POINT(-0.187 5.6037)",
      address: { full_address: "Osu, Accra" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status: "published",
    } as never)
    .select("id")
    .single();
  expect(error).toBeNull();
  placeId = must(place).id as string;
});

afterAll(async () => {
  await setSettings(original);
  if (conversationIds.size) {
    await svc
      .from("conversation")
      .delete()
      .in("id", [...conversationIds]);
  }
  await svc.from("conversation_block").delete().eq("blocker_id", organizer.id);
  if (postIds.length) await svc.from("content_post").delete().in("id", postIds);
  await svc.from("content_media").delete().eq("owner_id", organizer.id);
  await svc.from("place").delete().eq("id", placeId);
  await svc
    .from("admin_user")
    .delete()
    .in("user_id", [organizer.id, viewer.id]);
  for (const u of [organizer, viewer]) await deleteTestUser(svc as never, u.id);
});

beforeEach(async () => {
  await setSettings({
    stories_enabled: true,
    stories_audience: "staff",
    stories_posting_enabled: true,
    stories_comments_enabled: true,
    stories_reactions_enabled: true,
    creator_posting_enabled: true,
    beta_user_ids: [],
  } as Partial<SettingsRow>);
});

describe("story replies", () => {
  it("sends an organizer Story reply as a direct message with its Story", async () => {
    const storyId = await publishStory({ kind: "organizer", placeId: null });
    const first = await reply(storyId, "See you there!");
    expect(first.status, first.message).toBe(200);
    const { conversationId, message } = must(first.data);

    const ctx = readStoryReplyContext(message.system_data);
    expect(ctx).toMatchObject({
      postId: storyId,
      kind: "text",
      storyAuthorId: organizer.id,
      publisherKind: "organizer",
      mediaType: "image",
    });
    expect(ctx?.thumbnailUrl).toMatch(/^https:\/\//);

    const { data: conv } = await svc
      .from("conversation")
      .select("type, created_by, last_message_preview")
      .eq("id", conversationId)
      .single();
    expect(conv).toMatchObject({
      type: "direct",
      created_by: viewer.id,
      last_message_preview: "Replied to a story: See you there!",
    });
    const { data: parts } = await svc
      .from("conversation_participant")
      .select("user_id, role")
      .eq("conversation_id", conversationId);
    expect(parts).toHaveLength(2);
    expect(parts).toEqual(
      expect.arrayContaining([
        { user_id: viewer.id, role: "member" },
        { user_id: organizer.id, role: "organizer" },
      ]),
    );

    // The organizer sees it in their own inbox, readable under RLS.
    const { data: seen } = await organizer.client
      .from("message")
      .select("id, system_data")
      .eq("id", message.id)
      .single();
    expect(readStoryReplyContext(seen?.system_data as never)?.postId).toBe(
      storyId,
    );

    // A second reply — and a reply to another Story — reuse the conversation.
    const again = await reply(storyId, "Actually two of us");
    expect(must(again.data).conversationId).toBe(conversationId);
    const other = await publishStory({ kind: "organizer", placeId: null });
    const third = await reply(other, "🔥", "reaction");
    expect(third.status, third.message).toBe(200);
    expect(must(third.data).conversationId).toBe(conversationId);
    expect(
      readStoryReplyContext(must(third.data).message.system_data)?.kind,
    ).toBe("reaction");

    // The reaction also counts as the Story's reaction.
    const { data: reaction } = await svc
      .from("content_reaction")
      .select("emoji")
      .eq("post_id", other)
      .eq("user_id", viewer.id)
      .single();
    expect(reaction?.emoji).toBe("🔥");
  });

  it("is idempotent on the client id", async () => {
    const storyId = await publishStory({ kind: "organizer", placeId: null });
    const clientId = crypto.randomUUID();
    const a = await reply(storyId, "once", "text", clientId);
    const b = await reply(storyId, "once", "text", clientId);
    expect(must(a.data).message.id).toBe(must(b.data).message.id);
  });

  it("puts a place Story reply in the viewer's place conversation", async () => {
    const storyId = await publishStory({ kind: "place", placeId });
    const res = await reply(storyId, "Open tonight?");
    expect(res.status, res.message).toBe(200);
    const opened = await viewer.client.rpc("open_conversation", {
      p_type: "place",
      p_place_id: placeId,
    } as never);
    expect(opened.data).toBe(must(res.data).conversationId);
    expect(
      readStoryReplyContext(must(res.data).message.system_data)?.publisherKind,
    ).toBe("place");
  });

  it("refuses what the Story or programme does not allow", async () => {
    const closed = await publishStory(
      { kind: "organizer", placeId: null },
      false,
    );
    const refused = await reply(closed, "hello");
    expect(refused.status).toBe(409);
    expect(refused.message).toMatch(/turned off/i);
    // Reactions stay possible when replies are off.
    expect((await reply(closed, "👏", "reaction")).status).toBe(200);

    const own = await publishStory({ kind: "organizer", placeId: null });
    const self = await sendStoryReplyCore(svc, organizer.client, organizer.id, {
      postId: own,
      kind: "text",
      content: "me",
    });
    expect(self.status).toBe(409);

    await svc
      .from("content_post")
      .update({
        expires_at: new Date(Date.now() - 1000).toISOString(),
      } as never)
      .eq("id", own);
    expect((await reply(own, "late")).status).toBe(404);

    await setSettings({ stories_comments_enabled: false } as never);
    const live = await publishStory({ kind: "organizer", placeId: null });
    expect((await reply(live, "hi")).status).toBe(403);
    await setSettings({ stories_comments_enabled: true } as never);

    const { error } = await svc.from("conversation_block").insert({
      blocker_id: organizer.id,
      blocked_id: viewer.id,
      conversation_id: null,
    } as never);
    expect(error).toBeNull();
    const blocked = await viewer.client.rpc("send_story_reply", {
      p_post_id: live,
      p_content: "blocked?",
    });
    expect(blocked.error).not.toBeNull();
    await svc
      .from("conversation_block")
      .delete()
      .eq("blocker_id", organizer.id);
  });

  it("cannot be called signed out", async () => {
    const storyId = await publishStory({ kind: "organizer", placeId: null });
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    const res = await anon.rpc("send_story_reply", {
      p_post_id: storyId,
      p_content: "anon",
    });
    expect(res.error).not.toBeNull();
  });
});
