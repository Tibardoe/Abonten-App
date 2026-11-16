import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, stage 4c (docs/architecture/team-accounts.md §4e): the
// members who post for a team (Owners, Content and messages) publish
// Spotlights and Stories as the team, with their own uploads; the post is the
// team's, the team's activity names who published it; they edit, delete and
// moderate the team's posts; nobody replies to their own team's Story; paid
// promotion needs a role that also pays (teams-promotions-commission).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteContentCommentCore,
  listContentCommentsCore,
} from "../content/contentEngagementCore";
import {
  createContentPostCore,
  deleteContentPostCore,
  getContentPostCore,
  listOwnContentPostsCore,
  updateContentPostCore,
} from "../content/contentPostCore";
import {
  getContentProgramCore,
  resetContentSettingsCache,
} from "../content/contentProgram";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
} from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["content_program_setting"]["Row"];

const noText = { canTextNumber: async () => false };

describe("Spotlight and Stories as a team", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  let owner: TestUser;
  let content: TestUser;
  let manager: TestUser;
  let viewer: TestUser;
  let teamId: string;
  let placeId: string;
  let original: SettingsRow;
  const postIds: string[] = [];

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tc_${u.id.slice(0, 8)}`, full_name: "Post Person" })
      .eq("id", u.id);
    return u;
  }

  async function join(who: TestUser, role: "content" | "manager") {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role,
        target: { kind: "username", username: `tc_${who.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, who.id, {
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
  }

  async function makeMedia(ownerId: string) {
    const token = crypto.randomUUID().replace(/-/g, "");
    const { data, error } = await service
      .from("content_media")
      .insert({
        owner_id: ownerId,
        media_type: "image",
        public_id: `content_media/development/${ownerId}/it_${token}`,
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
    return (data as { id: string }).id;
  }

  async function postAsTeam(
    who: TestUser,
    kind: "spotlight" | "story",
    publish = true,
  ) {
    const mediaId = await makeMedia(who.id);
    const res = await createContentPostCore(
      svc,
      who.id,
      {
        kind,
        publisher: { kind: "organizer", placeId: null },
        mediaIds: [mediaId],
        caption: `Team ${kind} ${crypto.randomUUID().slice(0, 6)}`,
        hashtags: [],
        eventId: null,
        placeId: null,
        allowComments: true,
        allowDownload: false,
        rightsAcknowledged: true,
        publish,
      },
      teamId,
    );
    if (res.status === 200 && res.data) postIds.push(res.data.id);
    return res;
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    const { data } = await service
      .from("content_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    original = data as SettingsRow;
    await service
      .from("content_program_setting")
      .update({
        spotlight_enabled: true,
        spotlight_audience: "all",
        spotlight_posting_enabled: true,
        spotlight_comments_enabled: true,
        spotlight_promotions_enabled: true,
        stories_enabled: true,
        stories_audience: "all",
        stories_posting_enabled: true,
        stories_comments_enabled: true,
        stories_reactions_enabled: true,
      } as never)
      .eq("id", 1);
    resetContentSettingsCache();
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();

    owner = await person();
    [content, manager, viewer] = await Promise.all([
      person(),
      person(),
      person(),
    ]);
    const made = await createTeamCore(svc, owner.id, {
      name: "Reel Crew",
      username: `tct_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;
    await join(content, "content");
    await join(manager, "manager");

    // A published place makes the team a publisher.
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: teamId,
        name: "Reel Rooftop",
        slug: `reel-rooftop-${crypto.randomUUID()}`,
        description: "Run by a team.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    if (error || !place) throw new Error(error?.message);
    placeId = (place as { id: string }).id;
  });

  afterAll(async () => {
    await service
      .from("content_program_setting")
      .update(original as never)
      .eq("id", 1);
    resetContentSettingsCache();
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    if (postIds.length) {
      await service.from("content_comment").delete().in("post_id", postIds);
      await service.from("content_post").delete().in("id", postIds);
    }
    await service
      .from("content_media")
      .delete()
      .in(
        "owner_id",
        users.map((u) => u.id),
      );
    await service.from("conversation").delete().eq("created_by", viewer.id);
    await service.from("place").delete().eq("id", placeId);
    await service.from("notification").delete().eq("user_id", teamId);
    await service.auth.admin.deleteUser(teamId).catch(() => undefined);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("opens posting as the team, with its places; paying only with promotions.buy", async () => {
    const asTeam = await getContentProgramCore(svc, content.id, {
      publisherId: teamId,
    });
    expect(asTeam.data.spotlightPosting).toBe(true);
    expect(asTeam.data.publisherPlaces.map((p) => p.id)).toEqual([placeId]);
    expect(asTeam.data.spotlightPromotions).toBe(false);
    // On their own, the member (no events, no places) cannot post.
    const own = await getContentProgramCore(svc, content.id);
    expect(own.data.canPublish).toBe(false);
    // Managing as a team whose role does not post: posting is off.
    const blocked = await getContentProgramCore(svc, manager.id, {
      publisherId: manager.id,
      blocked: true,
    });
    expect(blocked.data.spotlightPosting).toBe(false);
  });

  it("publishes as the team with the member's own upload, and says who did it", async () => {
    const res = await postAsTeam(content, "spotlight");
    expect(res.status, res.message).toBe(200);
    const postId = res.data?.id as string;
    const { data: row } = await service
      .from("content_post")
      .select("author_id, status")
      .eq("id", postId)
      .single();
    expect(row).toEqual({ author_id: teamId, status: "published" });
    const { data: activity } = await service
      .from("team_activity")
      .select("actor_user_id, subject_id")
      .eq("team_id", teamId)
      .eq("action", "content_published")
      .eq("subject_id", postId)
      .single();
    expect(activity?.actor_user_id).toBe(content.id);

    // Someone else's upload cannot go into the team's post.
    const otherMedia = await makeMedia(owner.id);
    const stolen = await createContentPostCore(
      svc,
      content.id,
      {
        kind: "spotlight",
        publisher: { kind: "organizer", placeId: null },
        mediaIds: [otherMedia],
        caption: null,
        hashtags: [],
        eventId: null,
        placeId: null,
        allowComments: true,
        allowDownload: false,
        rightsAcknowledged: true,
        publish: false,
      } as never,
      teamId,
    );
    expect(stolen.status).toBe(404);
  });

  it("lets the members who post edit, list, moderate and delete the team's posts", async () => {
    const res = await postAsTeam(content, "spotlight");
    const postId = res.data?.id as string;

    const edited = await updateContentPostCore(svc, teamId, {
      postId,
      patch: { caption: "Rooftop sunsets" },
    } as never);
    expect(edited.status).toBe(200);
    // The member on their own does not author the team's post.
    const notMine = await updateContentPostCore(svc, content.id, {
      postId,
      patch: { caption: "Mine now" },
    } as never);
    expect(notMine.status).toBe(404);

    const list = await listOwnContentPostsCore(svc, teamId, {
      kind: "spotlight",
    });
    expect(list.data?.posts.map((p) => p.id)).toContain(postId);
    const mine = await listOwnContentPostsCore(svc, content.id, {
      kind: "spotlight",
    });
    expect(mine.data?.posts.map((p) => p.id)).not.toContain(postId);

    // The member opens the team's post as its author.
    const opened = await getContentPostCore(svc, content.id, postId, teamId);
    expect(opened.status).toBe(200);
    if (opened.status === 200) {
      expect(opened.data.post.viewer.isAuthor).toBe(true);
    }

    // A viewer's comment: the members who post for the team may remove it.
    const { data: comment } = await service
      .from("content_comment")
      .insert({ post_id: postId, author_id: viewer.id, body: "Nice!" } as never)
      .select("id")
      .single();
    const commentId = (comment as { id: string }).id;
    const listed = await listContentCommentsCore(
      svc,
      content.id,
      { postId },
      teamId,
    );
    expect(listed.data?.comments[0]?.canModerate).toBe(true);
    const refused = await deleteContentCommentCore(svc, manager.id, commentId);
    expect(refused.status).toBe(403);
    const removed = await deleteContentCommentCore(
      svc,
      content.id,
      commentId,
      teamId,
    );
    expect(removed.status).toBe(200);

    const deleted = await deleteContentPostCore(svc, teamId, postId);
    expect(deleted.status).toBe(200);
  });

  it("keeps a member from replying to their own team's Story; others reach the team", async () => {
    const res = await postAsTeam(owner, "story");
    expect(res.status, res.message).toBe(200);
    const postId = res.data?.id as string;

    const { error: own } = await content.client.rpc("send_story_reply", {
      p_post_id: postId,
      p_content: "Great story",
    });
    expect(own?.message).toMatch(/own Story/i);

    const { data, error } = await viewer.client.rpc("send_story_reply", {
      p_post_id: postId,
      p_content: "See you there!",
    });
    expect(error).toBeNull();
    const conversationId = (data as { conversation_id: string })
      .conversation_id;
    // The reply is in the team's inbox for the members who answer messages.
    const { data: inbox } = await content.client.rpc("list_conversations", {
      p_account: teamId,
    });
    expect(
      (inbox as { conversation_id: string }[]).map((r) => r.conversation_id),
    ).toContain(conversationId);
  });
});
