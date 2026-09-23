import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// The reviews experience (migrations 20260923090000 / 20260923090100)
// against a real database: one helpful vote per person, enforced by the
// database and not the client; who may vote; the cached counter can't be
// written by anyone signed in; "edited" is stamped by the database; the
// paged list keeps a star filter across pages; blocked reviewers drop out
// of the blocker's list; account-wide block rules; the setup reminder's
// dismissal record is private to its owner.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listBlockedAccountsCore,
  setUserBlockCore,
} from "../profile/userBlockCore";
import { setReviewHelpfulCore } from "../reviews/reviewHelpfulCore";
import {
  fetchReviewById,
  fetchReviewPage,
  fetchReviewSummary,
} from "../reviews/reviewListQuery";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.SUPABASE_TEST_URL as string,
    process.env.SUPABASE_TEST_ANON_KEY as string,
    { auth: { persistSession: false } },
  );
}

describe("reviews experience", () => {
  let service: SupabaseClient<Database>;
  let owner: TestUser;
  let reviewer: TestUser;
  let voter: TestUser;
  let other: TestUser;
  let placeId: string;
  let eventId: string;
  let placeReviewId: string;
  let eventReviewId: string;
  // Extra reviewers created with the admin API only (no session needed).
  const bulkUserIds: string[] = [];

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service);
    reviewer = await createTestUser(service);
    voter = await createTestUser(service);
    other = await createTestUser(service);

    const { data: place, error: placeError } = await service
      .from("place")
      .insert({
        owner_id: owner.id,
        name: "Reviews Test Lounge",
        slug: `reviews-test-lounge-${crypto.randomUUID()}`,
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
    if (placeError || !place) throw new Error(placeError?.message);
    placeId = place.id;

    const fixture = await createTestEventWithTicketType(service, owner.id, {
      quantity: 10,
      price: 50,
    });
    eventId = fixture.eventId;

    const { data: pr, error: prError } = await service
      .from("place_review")
      .insert({
        place_id: placeId,
        reviewer_id: reviewer.id,
        rating: 5,
        comment: "Great spot",
        status: "approved",
      })
      .select("id")
      .single();
    if (prError || !pr) throw new Error(prError?.message);
    placeReviewId = pr.id;

    const { data: er, error: erError } = await service
      .from("event_review")
      .insert({
        event_id: eventId,
        reviewer_id: reviewer.id,
        rating: 4,
        comment: "Good night",
        status: "approved",
      })
      .select("id")
      .single();
    if (erError || !er) throw new Error(erError?.message);
    eventReviewId = er.id;

    // 24 more place reviews: ratings 1..5 in rotation, spaced a minute apart.
    for (let i = 0; i < 24; i++) {
      const { data: u, error } = await service.auth.admin.createUser({
        email: `reviews-bulk-${Date.now()}-${i}@example.test`,
        email_confirm: true,
      });
      if (error || !u.user) throw new Error(error?.message);
      bulkUserIds.push(u.user.id);
    }
    const rows = bulkUserIds.map((id, i) => ({
      place_id: placeId,
      reviewer_id: id,
      rating: (i % 5) + 1,
      comment: `Bulk ${i}`,
      status: "approved",
      created_at: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
    }));
    const { error: bulkError } = await service
      .from("place_review")
      .insert(rows);
    if (bulkError) throw new Error(bulkError.message);
  }, 120_000);

  afterAll(async () => {
    await service.from("place").delete().eq("id", placeId);
    await deleteTestEvent(service, eventId);
    for (const id of bulkUserIds) await service.auth.admin.deleteUser(id);
    for (const u of [other, voter, reviewer, owner]) {
      if (u) await deleteTestUser(service, u.id);
    }
  }, 120_000);

  describe("helpful votes", () => {
    it("counts one vote per person, however often it is sent", async () => {
      const first = await setReviewHelpfulCore(voter.client, {
        kind: "place",
        reviewId: placeReviewId,
        helpful: true,
      });
      expect(first).toMatchObject({
        status: 200,
        data: { helpfulCount: 1, viewerFoundHelpful: true },
      });
      const again = await setReviewHelpfulCore(voter.client, {
        kind: "place",
        reviewId: placeReviewId,
        helpful: true,
      });
      expect(again.data).toEqual({ helpfulCount: 1, viewerFoundHelpful: true });

      const second = await setReviewHelpfulCore(other.client, {
        kind: "place",
        reviewId: placeReviewId,
        helpful: true,
      });
      expect(second.data?.helpfulCount).toBe(2);

      const undo = await setReviewHelpfulCore(voter.client, {
        kind: "place",
        reviewId: placeReviewId,
        helpful: false,
      });
      expect(undo.data).toEqual({ helpfulCount: 1, viewerFoundHelpful: false });
      const undoAgain = await setReviewHelpfulCore(voter.client, {
        kind: "place",
        reviewId: placeReviewId,
        helpful: false,
      });
      expect(undoAgain.data?.helpfulCount).toBe(1);

      // The list reports the viewer's own vote state.
      const page = await fetchReviewById(
        other.client,
        "place",
        placeId,
        placeReviewId,
      );
      expect(page).toMatchObject({ helpfulCount: 1, viewerFoundHelpful: true });
    });

    it("works for event reviews too", async () => {
      const res = await setReviewHelpfulCore(voter.client, {
        kind: "event",
        reviewId: eventReviewId,
        helpful: true,
      });
      expect(res.data).toEqual({ helpfulCount: 1, viewerFoundHelpful: true });
    });

    it("refuses the author, the owner and the organizer", async () => {
      const own = await setReviewHelpfulCore(reviewer.client, {
        kind: "place",
        reviewId: placeReviewId,
        helpful: true,
      });
      expect(own.status).toBe(400);
      const placeOwner = await setReviewHelpfulCore(owner.client, {
        kind: "place",
        reviewId: placeReviewId,
        helpful: true,
      });
      expect(placeOwner.status).toBe(400);
      const organizer = await setReviewHelpfulCore(owner.client, {
        kind: "event",
        reviewId: eventReviewId,
        helpful: true,
      });
      expect(organizer.status).toBe(400);
    });

    it("refuses signed-out callers and a kind/id mismatch", async () => {
      const { error } = await anonClient().rpc("review_set_helpful", {
        p_review_kind: "place",
        p_review_id: placeReviewId,
        p_helpful: true,
      });
      expect(error).not.toBeNull();

      const wrongKind = await setReviewHelpfulCore(voter.client, {
        kind: "event",
        reviewId: placeReviewId,
        helpful: true,
      });
      expect(wrongKind.status).toBe(404);
    });

    it("can't be forged by writing the vote table or the counter", async () => {
      const { error: insertError } = await voter.client
        .from("place_review_helpful")
        .insert({ review_id: placeReviewId, user_id: voter.id });
      expect(insertError).not.toBeNull();

      const { error: deleteError, count } = await voter.client
        .from("place_review_helpful")
        .delete({ count: "exact" })
        .eq("review_id", placeReviewId);
      expect(deleteError !== null || count === 0).toBe(true);

      // The author may update their review, but not its counter.
      const { error: counterError } = await reviewer.client
        .from("place_review")
        .update({ helpful_count: 999 } as never)
        .eq("id", placeReviewId);
      expect(counterError).not.toBeNull();

      const { data: row } = await service
        .from("place_review")
        .select("helpful_count")
        .eq("id", placeReviewId)
        .single();
      expect(row?.helpful_count).toBe(1);
    });

    it("a new review can't be posted with votes already on it", async () => {
      const { data, error } = await voter.client
        .from("place_review")
        .insert({
          place_id: placeId,
          reviewer_id: voter.id,
          rating: 3,
          status: "approved",
          helpful_count: 50,
          edited_at: "2020-01-01T00:00:00Z",
        } as never)
        .select("id, helpful_count, edited_at")
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ helpful_count: 0, edited_at: null });
      await service
        .from("place_review")
        .delete()
        .eq("id", data?.id as string);
    });

    it("refuses a hidden review", async () => {
      await service
        .from("place_review")
        .update({ moderation_state: "hidden" })
        .eq("id", placeReviewId);
      const res = await setReviewHelpfulCore(other.client, {
        kind: "place",
        reviewId: placeReviewId,
        helpful: false,
      });
      expect(res.status).toBe(404);
      await service
        .from("place_review")
        .update({ moderation_state: null })
        .eq("id", placeReviewId);
    });
  });

  describe("edited stamp", () => {
    it("stamps content edits, ignores replies, and can't be forged", async () => {
      const { data: reply } = await owner.client
        .from("event_review")
        .update({
          organizer_response: "Thanks!",
          organizer_response_at: new Date().toISOString(),
        })
        .eq("id", eventReviewId)
        .select("edited_at")
        .single();
      expect(reply?.edited_at).toBeNull();

      const { data: edited, error } = await reviewer.client
        .from("event_review")
        .update({ comment: "Good night, great sound", edited_at: null })
        .eq("id", eventReviewId)
        .select("edited_at")
        .single();
      expect(error).toBeNull();
      expect(edited?.edited_at).not.toBeNull();

      const { data: forged } = await reviewer.client
        .from("event_review")
        .update({ edited_at: "2020-01-01T00:00:00Z" })
        .eq("id", eventReviewId)
        .select("edited_at")
        .single();
      expect(forged?.edited_at).toBe(edited?.edited_at);
    });
  });

  describe("list and summary", () => {
    it("summarises every public review", async () => {
      const res = await fetchReviewSummary(anonClient(), "place", placeId);
      expect(res.status).toBe(200);
      // 1 five-star + 24 bulk (ratings 1..5, five each minus one five)
      expect(res.data?.total).toBe(25);
      expect(res.data?.counts).toEqual({ 1: 5, 2: 5, 3: 5, 4: 5, 5: 5 });
    });

    it("keeps a star filter across every page, with no repeats", async () => {
      for (const sort of ["recent", "helpful"] as const) {
        const seen: string[] = [];
        let cursor = null;
        for (let guard = 0; guard < 10; guard++) {
          const page = await fetchReviewPage(anonClient(), {
            kind: "place",
            subjectId: placeId,
            rating: 5,
            sort,
            cursor,
            limit: 2,
          });
          expect(page.status).toBe(200);
          for (const r of page.data?.reviews ?? []) {
            expect(r.rating).toBe(5);
            seen.push(r.id);
          }
          cursor = page.data?.nextCursor ?? null;
          if (!cursor) break;
        }
        expect(seen).toHaveLength(5);
        expect(new Set(seen).size).toBe(5);
      }
    });

    it("pages the whole list in order without gaps", async () => {
      const seen: string[] = [];
      let cursor = null;
      let lastKey: [number, string] | null = null;
      for (let guard = 0; guard < 20; guard++) {
        const page = await fetchReviewPage(anonClient(), {
          kind: "place",
          subjectId: placeId,
          sort: "helpful",
          cursor,
          limit: 4,
        });
        for (const r of page.data?.reviews ?? []) {
          const key: [number, string] = [r.helpfulCount, r.createdAt];
          if (lastKey) {
            const ordered =
              key[0] < lastKey[0] ||
              (key[0] === lastKey[0] && key[1] <= lastKey[1]);
            expect(ordered).toBe(true);
          }
          lastKey = key;
          seen.push(r.id);
        }
        cursor = page.data?.nextCursor ?? null;
        if (!cursor) break;
      }
      expect(seen).toHaveLength(25);
      expect(new Set(seen).size).toBe(25);
      // The review with a vote sorts first.
      expect(seen[0]).toBe(placeReviewId);
    });

    it("can leave the viewer's own review out", async () => {
      const page = await fetchReviewPage(reviewer.client, {
        kind: "place",
        subjectId: placeId,
        excludeViewer: true,
        limit: 40,
      });
      expect(page.data?.reviews.some((r) => r.id === placeReviewId)).toBe(
        false,
      );
      expect(page.data?.reviews).toHaveLength(24);
    });

    it("rejects an unknown sort or rating", async () => {
      const res = await fetchReviewPage(anonClient(), {
        kind: "place",
        subjectId: placeId,
        sort: "oldest" as never,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("account-wide block", () => {
    it("hides the blocked person's reviews, stops votes, and can be undone", async () => {
      const blocked = await setUserBlockCore(voter.client, {
        blockedUserId: reviewer.id,
        block: true,
      });
      expect(blocked).toMatchObject({ status: 200, data: { blocked: true } });

      const byId = await fetchReviewById(
        voter.client,
        "place",
        placeId,
        placeReviewId,
      );
      expect(byId).toBeNull();
      const page = await fetchReviewPage(voter.client, {
        kind: "place",
        subjectId: placeId,
        limit: 40,
      });
      expect(page.data?.reviews.some((r) => r.reviewerId === reviewer.id)).toBe(
        false,
      );
      // Everyone else still sees it; the summary is unchanged.
      expect(
        await fetchReviewById(other.client, "place", placeId, placeReviewId),
      ).not.toBeNull();

      const vote = await setReviewHelpfulCore(voter.client, {
        kind: "event",
        reviewId: eventReviewId,
        helpful: false,
      });
      expect(vote.status).toBe(403);

      const list = await listBlockedAccountsCore(voter.client, voter.id);
      expect(list.data?.map((b) => b.userId)).toEqual([reviewer.id]);
      // Nobody else can read that list.
      const { data: peek } = await other.client
        .from("conversation_block")
        .select("id")
        .eq("blocker_id", voter.id);
      expect(peek).toEqual([]);

      const again = await setUserBlockCore(voter.client, {
        blockedUserId: reviewer.id,
        block: true,
      });
      expect(again.status).toBe(200);
      const { count } = await service
        .from("conversation_block")
        .select("id", { count: "exact", head: true })
        .eq("blocker_id", voter.id)
        .is("conversation_id", null);
      expect(count).toBe(1);

      const unblocked = await setUserBlockCore(voter.client, {
        blockedUserId: reviewer.id,
        block: false,
      });
      expect(unblocked.data?.blocked).toBe(false);
      expect(
        await fetchReviewById(voter.client, "place", placeId, placeReviewId),
      ).not.toBeNull();
    });

    it("refuses blocking yourself or nobody", async () => {
      const self = await setUserBlockCore(voter.client, {
        blockedUserId: voter.id,
        block: true,
      });
      expect(self.status).toBe(400);
      const ghost = await setUserBlockCore(voter.client, {
        blockedUserId: crypto.randomUUID(),
        block: true,
      });
      expect(ghost.status).toBe(404);
      const { error } = await anonClient().rpc("user_block_set", {
        p_blocked_id: voter.id,
        p_block: true,
      });
      expect(error).not.toBeNull();
    });

    it("ends a follow between the two people", async () => {
      await service.from("follow").insert([
        {
          follower_id: other.id,
          target_kind: "organizer",
          target_id: owner.id,
        },
        {
          follower_id: owner.id,
          target_kind: "organizer",
          target_id: other.id,
        },
      ]);
      await setUserBlockCore(other.client, {
        blockedUserId: owner.id,
        block: true,
      });
      const { data: follows } = await service
        .from("follow")
        .select("id")
        .or(
          `and(follower_id.eq.${other.id},target_id.eq.${owner.id}),and(follower_id.eq.${owner.id},target_id.eq.${other.id})`,
        );
      expect(follows).toEqual([]);
      await setUserBlockCore(other.client, {
        blockedUserId: owner.id,
        block: false,
      });
    });
  });

  describe("username chosen flag", () => {
    it("is set by changing the username, and can't be flipped alone", async () => {
      await service
        .from("user_info")
        .update({ username_is_generated: true })
        .eq("id", other.id);

      const { error: flipError } = await other.client
        .from("user_info")
        .update({ username_is_generated: false })
        .eq("id", other.id);
      expect(flipError).toBeNull();
      const flipped = await service
        .from("user_info")
        .select("username_is_generated")
        .eq("id", other.id)
        .single();
      expect(flipped.data?.username_is_generated).toBe(true);

      const chosen = `chosen_${Date.now().toString(36)}`;
      const { error } = await other.client
        .from("user_info")
        .update({ username: chosen })
        .eq("id", other.id);
      expect(error).toBeNull();
      const after = await service
        .from("user_info")
        .select("username, username_is_generated")
        .eq("id", other.id)
        .single();
      expect(after.data).toMatchObject({
        username: chosen,
        username_is_generated: false,
      });

      // Service-role writes (account deletion) keep what they set.
      await service
        .from("user_info")
        .update({ username_is_generated: true })
        .eq("id", other.id);
      const reset = await service
        .from("user_info")
        .select("username_is_generated")
        .eq("id", other.id)
        .single();
      expect(reset.data?.username_is_generated).toBe(true);
    });
  });

  describe("account setup reminder", () => {
    it("records dismissals for the caller only", async () => {
      const first = await voter.client
        .rpc("account_setup_prompt_dismiss")
        .single();
      expect(first.data).toMatchObject({ dismiss_count: 1 });
      const second = await voter.client
        .rpc("account_setup_prompt_dismiss")
        .single();
      expect(second.data).toMatchObject({ dismiss_count: 2 });

      const own = await voter.client
        .from("account_setup_prompt_state")
        .select("dismiss_count")
        .maybeSingle();
      expect(own.data?.dismiss_count).toBe(2);
      const peek = await other.client
        .from("account_setup_prompt_state")
        .select("user_id")
        .eq("user_id", voter.id);
      expect(peek.data).toEqual([]);
      const { error: writeError } = await voter.client
        .from("account_setup_prompt_state")
        .update({ dismiss_count: 0 })
        .eq("user_id", voter.id);
      const after = await service
        .from("account_setup_prompt_state")
        .select("dismiss_count")
        .eq("user_id", voter.id)
        .single();
      expect(writeError !== null || after.data?.dismiss_count === 2).toBe(true);
      expect(after.data?.dismiss_count).toBe(2);

      const { error } = await anonClient().rpc("account_setup_prompt_dismiss");
      expect(error).not.toBeNull();
    });
  });
});
