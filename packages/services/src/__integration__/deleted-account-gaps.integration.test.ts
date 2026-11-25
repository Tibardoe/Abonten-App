import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// What a deleted account leaves behind (migration 20261125140000,
// docs/architecture/team-accounts.md §4o, docs/privacy/data-retention-and-
// deletion.md §2): its Spotlight posts and Stories come down and their
// media is queued for Cloudinary only when nothing else uses it and no
// report is open; a paid promotion stops the deletion instead of being
// ended silently; its places stay listed, unclaimed, take no new
// conversation or booking, and can be claimed; its reviews read as a
// former member without the scrubbed handle; and the clean-up for accounts
// deleted earlier is idempotent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openConversationCore } from "../messaging/openConversationCore";
import { fetchPlaceReviewsForOwner } from "../places/placeBookingsReviewsCore";
import { requestPlaceBookingCore } from "../places/requestPlaceBookingCore";
import { deleteAccountCore } from "../profile/deleteAccountCore";
import { createTeamCore } from "../teams/teamCore";
import { requestTeamDeletionCore } from "../teams/teamDeletionCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type Cleanup = Record<string, number>;

describe("a deleted account leaves nothing that acts for it", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const placeIds: string[] = [];
  const eventIds: string[] = [];
  const campaignIds: string[] = [];
  const reportIds: string[] = [];
  const teamIds: string[] = [];
  const tag = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `dg_${tag()}`, full_name: "Gap Tester" })
      .eq("id", u.id);
    return u;
  }

  async function makePlace(ownerId: string, claimed = false): Promise<string> {
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: ownerId,
        name: "Gap Lounge",
        slug: `gap-lounge-${crypto.randomUUID()}`,
        description: "Integration test place",
        category_id: 1,
        location: "SRID=4326;POINT(-0.187 5.6037)",
        address: { full_address: "Osu, Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        claimed,
      } as never)
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    const id = (data as { id: string }).id;
    placeIds.push(id);
    return id;
  }

  /** A published Spotlight or Story with one image. */
  async function post(
    authorId: string,
    kind: "spotlight" | "story" = "spotlight",
  ) {
    const publicId = `content_media/development/${authorId}/it_${tag()}`;
    const { data: p, error } = await service
      .from("content_post")
      .insert({
        kind,
        author_id: authorId,
        status: "published",
        published_at: new Date().toISOString(),
        expires_at:
          kind === "story"
            ? new Date(Date.now() + 86_400_000).toISOString()
            : null,
        caption: "Gap test",
      } as never)
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    const postId = (p as { id: string }).id;
    const { data: m, error: mediaError } = await service
      .from("content_media")
      .insert({
        owner_id: authorId,
        post_id: postId,
        media_type: "image",
        public_id: publicId,
        version: 1,
        bytes: 1000,
        width: 720,
        height: 1280,
        media_url: `https://res.cloudinary.com/demo/image/upload/${publicId}`,
        status: "ready",
      } as never)
      .select("id")
      .single();
    expect(mediaError, mediaError?.message).toBeNull();
    return { postId, mediaId: (m as { id: string }).id, publicId };
  }

  async function campaign(
    postId: string,
    advertiserId: string,
    status: string,
    paidMinor: number,
  ): Promise<string> {
    const { data, error } = await service
      .from("content_campaign")
      .insert({
        post_id: postId,
        advertiser_id: advertiserId,
        budget_minor: 1000,
        currency: "GHS",
        duration_days: 1,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86_400_000).toISOString(),
        pricing_version: 1,
        cpm_minor: 1000,
        impression_goal: 1000,
        status,
        paid_minor: paidMinor,
      } as never)
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    const id = (data as { id: string }).id;
    campaignIds.push(id);
    return id;
  }

  const postStatus = async (postId: string) =>
    (
      await service
        .from("content_post")
        .select("status, deleted_at")
        .eq("id", postId)
        .single()
    ).data as { status: string; deleted_at: string | null };

  const mediaStatus = async (mediaId: string) =>
    (
      await service
        .from("content_media")
        .select("status")
        .eq("id", mediaId)
        .single()
    ).data?.status;

  async function queued(publicId: string): Promise<number> {
    const { count } = await service
      .from("draft_asset_cleanup_queue")
      .select("id", { count: "exact", head: true })
      .eq("public_id", publicId)
      .in("status", ["queued", "sending"]);
    return count ?? 0;
  }

  async function deleteAccount(u: TestUser) {
    const res = await deleteAccountCore(u.id, { serviceClient: service });
    expect(res.status, res.message).toBe(200);
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
  });

  afterAll(async () => {
    if (campaignIds.length > 0) {
      await service.from("content_campaign").delete().in("id", campaignIds);
    }
    if (reportIds.length > 0) {
      await service.from("report").delete().in("id", reportIds);
    }
    for (const id of eventIds) await deleteTestEvent(service, id);
    for (const u of users) {
      await service.from("content_post").delete().eq("author_id", u.id);
    }
    for (const id of teamIds) {
      await service.from("content_post").delete().eq("author_id", id);
    }
    if (placeIds.length > 0) {
      await service.from("place").delete().in("id", placeIds);
    }
    for (const u of users) await deleteTestUser(service, u.id);
  });

  it("takes a person's posts down and queues only media nothing else uses", async () => {
    const owner = await person();
    const neighbour = await person();
    const plain = await post(owner.id, "spotlight");
    const story = await post(owner.id, "story");
    const reported = await post(owner.id, "spotlight");
    const withDraft = await post(owner.id, "spotlight");
    const draftCampaign = await campaign(
      withDraft.postId,
      owner.id,
      "draft",
      0,
    );

    // Another account's place uses the Story's image as its cover.
    await makePlace(neighbour.id).then((id) =>
      service
        .from("place")
        .update({ cover_public_id: story.publicId } as never)
        .eq("id", id),
    );
    const { data: report } = await service
      .from("report")
      .insert({
        reporter_id: neighbour.id,
        target_type: "spotlight",
        target_id: reported.postId,
        dedupe_key: `spotlight:${reported.postId}`,
        category: "inappropriate",
      } as never)
      .select("id")
      .single();
    reportIds.push((report as { id: string }).id);

    await deleteAccount(owner);

    for (const p of [plain, story, reported, withDraft]) {
      const row = await postStatus(p.postId);
      expect(row.status).toBe("deleted");
      expect(row.deleted_at).not.toBeNull();
    }
    expect(await mediaStatus(plain.mediaId)).toBe("deleted");
    expect(await queued(plain.publicId)).toBe(1);
    expect(await queued(withDraft.publicId)).toBe(1);
    // Shared with a listing: kept and not queued.
    expect(await mediaStatus(story.mediaId)).toBe("ready");
    expect(await queued(story.publicId)).toBe(0);
    // Under an open report: kept for the usual retention.
    expect(await mediaStatus(reported.mediaId)).toBe("ready");
    expect(await queued(reported.publicId)).toBe(0);

    const { data: c } = await service
      .from("content_campaign")
      .select("status")
      .eq("id", draftCampaign)
      .single();
    expect(c?.status).toBe("cancelled");
  });

  it("stops the deletion while a paid promotion runs or its payment is going through", async () => {
    const u = await person();
    const p = await post(u.id);
    const running = await campaign(p.postId, u.id, "active", 1000);

    const blockers = async () =>
      (await service.rpc("account_deletion_blockers", { p_user_id: u.id }))
        .data as unknown as Record<string, number>;

    expect(Number((await blockers()).promotions_running)).toBe(1);
    const refused = await deleteAccountCore(u.id, { serviceClient: service });
    expect(refused.status).toBe(409);
    expect(refused.message).toMatch(/Spotlight promotion/);
    expect((await postStatus(p.postId)).status).toBe("published");

    await service
      .from("content_campaign")
      .update({ status: "pending_payment", paid_minor: 0 } as never)
      .eq("id", running);
    expect(Number((await blockers()).payments_in_progress)).toBe(1);
    expect(
      (await deleteAccountCore(u.id, { serviceClient: service })).status,
    ).toBe(409);

    // Once it is over the person may leave.
    await service
      .from("content_campaign")
      .update({ status: "cancelled" } as never)
      .eq("id", running);
    await deleteAccount(u);
    expect((await postStatus(p.postId)).status).toBe("deleted");
  });

  it("takes a deleted team's posts down too", async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
    try {
      const owner = await person();
      const made = await createTeamCore(svc, owner.id, {
        adult: true,
        name: "Gap Crew",
        username: `gapt_${tag()}`,
      });
      if (made.status !== 200) throw new Error(made.message);
      const teamId = made.data.id;
      teamIds.push(teamId);
      const teamPost = await post(teamId, "story");
      const placeId = await makePlace(teamId, true);

      const res = await requestTeamDeletionCore(
        svc,
        owner.id,
        { teamId, confirmName: "Gap Crew" },
        { signedInAt: Date.now() },
      );
      expect(res.status, "message" in res ? res.message : "").toBe(200);

      expect((await postStatus(teamPost.postId)).status).toBe("deleted");
      expect(await queued(teamPost.publicId)).toBe(1);
      const { data: place } = await service
        .from("place")
        .select("claimed, owner_id")
        .eq("id", placeId)
        .single();
      expect(place).toMatchObject({ claimed: false, owner_id: teamId });
    } finally {
      await service
        .from("team_program_setting")
        .update({ enabled: false })
        .eq("id", 1);
      resetTeamSettingsCache();
    }
  });

  it("leaves a deleted owner's place listed, unclaimed, closed to new conversations and bookings, and claimable", async () => {
    const owner = await person();
    const earlier = await person();
    const customer = await person();
    const claimant = await person();
    const admin = await person();
    const placeId = await makePlace(owner.id, true);
    await service
      .from("place")
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
      } as never)
      .eq("id", placeId);
    // An open verification request on the place by someone other than the
    // owner (a legacy claim review): an owner change withdraws it, so must
    // the owner leaving.
    const { data: vcase, error: caseError } = await service
      .from("verification_case")
      .insert({
        subject_type: "place",
        place_id: placeId,
        requester_id: earlier.id,
        status: "draft",
        source: "legacy_claim",
      } as never)
      .select("id")
      .single();
    expect(caseError, caseError?.message).toBeNull();

    const before = await openConversationCore(earlier.client, earlier.id, {
      type: "place",
      placeId,
    });
    expect(before.status).toBe(200);
    const earlierConversation = before.data?.conversationId ?? "";

    await deleteAccount(owner);

    const { data: place } = await service
      .from("place")
      .select("status, claimed, verified, owner_id")
      .eq("id", placeId)
      .single();
    expect(place).toMatchObject({
      status: "published",
      claimed: false,
      verified: false,
      owner_id: owner.id,
    });
    const { data: caseAfter } = await service
      .from("verification_case")
      .select("status")
      .eq("id", (vcase as { id: string }).id)
      .single();
    expect(caseAfter?.status).toBe("withdrawn");

    // Nobody starts a new conversation with it, in a friendly sentence.
    const refused = await openConversationCore(customer.client, customer.id, {
      type: "place",
      placeId,
    });
    expect(refused.status).toBe(409);
    expect("message" in refused ? refused.message : "").toMatch(
      /Nobody manages this place on Abonten/,
    );
    const { count: newOnes } = await service
      .from("conversation")
      .select("id", { count: "exact", head: true })
      .eq("place_id", placeId)
      .eq("created_by", customer.id);
    expect(newOnes).toBe(0);

    // A conversation from before still opens (closed, history readable).
    const again = await openConversationCore(earlier.client, earlier.id, {
      type: "place",
      placeId,
    });
    expect(again.data?.conversationId).toBe(earlierConversation);
    const { data: conv } = await service
      .from("conversation")
      .select("status")
      .eq("id", earlierConversation)
      .single();
    expect(conv?.status).toBe("closed");

    // No booking request either.
    const booking = await requestPlaceBookingCore(
      customer.client,
      customer.id,
      {
        placeId,
        requestedTime: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      },
    );
    expect(booking.status).toBe(400);

    // It can be claimed, and then it takes conversations again.
    const { data: claim, error: claimError } = await claimant.client
      .from("place_claim_request")
      .insert({
        place_id: placeId,
        claimant_id: claimant.id,
        status: "pending",
      })
      .select("id")
      .single();
    expect(claimError, claimError?.message).toBeNull();
    await service
      .from("user_info")
      .update({ is_admin: true } as never)
      .eq("id", admin.id);
    const { error: approveError } = await service.rpc("approve_place_claim", {
      p_request_id: (claim as { id: string }).id,
      p_admin_id: admin.id,
    });
    expect(approveError, approveError?.message).toBeNull();
    await service
      .from("user_info")
      .update({ is_admin: false } as never)
      .eq("id", admin.id);
    const opened = await openConversationCore(customer.client, customer.id, {
      type: "place",
      placeId,
    });
    expect(opened.status).toBe(200);
  });

  it("takes no new conversation for an event whose organizer is deleted", async () => {
    const organizer = await person();
    const customer = await person();
    const { eventId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 5 },
    );
    eventIds.push(eventId);
    await deleteAccount(organizer);

    const refused = await openConversationCore(customer.client, customer.id, {
      type: "event",
      eventId,
    });
    expect(refused.status).toBe(409);
    expect("message" in refused ? refused.message : "").toMatch(
      /no longer on Abonten/,
    );
  });

  it("shows a deleted reviewer as a former member, never the scrubbed handle", async () => {
    const reviewer = await person();
    const owner = await person();
    const placeId = await makePlace(owner.id);
    const { error } = await service.from("place_review").insert({
      place_id: placeId,
      reviewer_id: reviewer.id,
      rating: 4,
      comment: "Lovely evening.",
      status: "approved",
    } as never);
    expect(error, error?.message).toBeNull();

    await deleteAccount(reviewer);

    const list = await fetchPlaceReviewsForOwner(
      owner.client,
      owner.id,
      placeId,
    );
    expect(list.status).toBe(200);
    expect(list.data).toHaveLength(1);
    expect(list.data[0].user_info).toEqual({
      username: null,
      avatar_public_id: null,
      avatar_version: null,
      deleted: true,
    });
    expect(list.data[0].comment).toBe("Lovely evening.");
    expect(JSON.stringify(list.data)).not.toContain("deleted_");
  });

  it("cleans up an account deleted before the migration, once", async () => {
    const old = await person();
    const followed = await person();
    const p = await post(old.id);
    const placeId = await makePlace(old.id, true);
    await service.from("follow").insert({
      follower_id: old.id,
      target_kind: "organizer",
      target_id: followed.id,
    } as never);
    // Deleted the old way: scrubbed, nothing else done.
    await service
      .from("user_info")
      .update({
        status_id: 4,
        username: `deleted_${old.id.replace(/-/g, "").slice(0, 12)}`,
        full_name: "Deleted user",
      } as never)
      .eq("id", old.id);

    const first = (
      await service.rpc("_deleted_account_cleanup", { p_account: old.id })
    ).data as unknown as Cleanup;
    expect(first).toMatchObject({
      posts_removed: 1,
      media_queued: 1,
      places_unclaimed: 1,
      follows_by_removed: 1,
      posts_kept: 0,
      media_kept: 0,
    });
    expect((await postStatus(p.postId)).status).toBe("deleted");
    const { data: place } = await service
      .from("place")
      .select("claimed")
      .eq("id", placeId)
      .single();
    expect(place?.claimed).toBe(false);

    const second = (
      await service.rpc("_deleted_account_cleanup", { p_account: old.id })
    ).data as unknown as Cleanup;
    for (const [key, value] of Object.entries(second)) {
      expect(value, key).toBe(0);
    }
    expect(await queued(p.publicId)).toBe(1);
  });
});
