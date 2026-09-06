import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// The organizer/owner review-response CRUD must be authorized server-side,
// not by the frontend: only the event's organizer may create / edit /
// delete the `organizer_response` on one of their event's reviews, and a
// malicious client passing someone else's review id gets 403 — enforced by
// RLS (event_review_organizer_update) + the column-guard trigger, which the
// service cores surface as a clean envelope.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteEventReviewResponseCore,
  respondToEventReviewCore,
} from "../reviews/reviewResponseCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("review responses: server-side authorization", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let reviewer: TestUser;
  let attacker: TestUser;
  let eventId: string;
  let reviewId: string;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    reviewer = await createTestUser(service);
    attacker = await createTestUser(service);

    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    eventId = fixture.eventId;

    const { data: review, error } = await service
      .from("event_review")
      .insert({
        event_id: eventId,
        reviewer_id: reviewer.id,
        rating: 4,
        comment: "Decent event.",
        status: "approved",
      })
      .select("id")
      .single();
    if (error || !review) {
      throw new Error(`review fixture failed: ${error?.message}`);
    }
    reviewId = review.id;
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, attacker.id);
    await deleteTestUser(service, reviewer.id);
    await deleteTestUser(service, organizer.id);
  });

  it("lets the organizer create then edit a reply", async () => {
    const created = await respondToEventReviewCore(
      organizer.client,
      organizer.id,
      reviewId,
      "  Thanks for coming!  ",
    );
    expect(created.status).toBe(200);

    const { data: row1 } = await service
      .from("event_review")
      .select("organizer_response")
      .eq("id", reviewId)
      .single();
    expect(row1?.organizer_response).toBe("Thanks for coming!");

    const edited = await respondToEventReviewCore(
      organizer.client,
      organizer.id,
      reviewId,
      "Thanks — hope to see you at the next one.",
    );
    expect(edited.status).toBe(200);

    const { data: row2 } = await service
      .from("event_review")
      .select("organizer_response")
      .eq("id", reviewId)
      .single();
    expect(row2?.organizer_response).toMatch(/next one/);
  });

  it("rejects an empty reply", async () => {
    const res = await respondToEventReviewCore(
      organizer.client,
      organizer.id,
      reviewId,
      "   ",
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-organizer creating a reply", async () => {
    const res = await respondToEventReviewCore(
      attacker.client,
      attacker.id,
      reviewId,
      "I run this event, honest.",
    );
    expect(res.status).toBe(403);

    const { data: row } = await service
      .from("event_review")
      .select("organizer_response")
      .eq("id", reviewId)
      .single();
    expect(row?.organizer_response).toBeNull();
  });

  it("rejects a non-organizer deleting the organizer's reply", async () => {
    await respondToEventReviewCore(
      organizer.client,
      organizer.id,
      reviewId,
      "Genuine reply.",
    );

    const res = await deleteEventReviewResponseCore(
      attacker.client,
      attacker.id,
      reviewId,
    );
    expect(res.status).toBe(403);

    const { data: row } = await service
      .from("event_review")
      .select("organizer_response")
      .eq("id", reviewId)
      .single();
    expect(row?.organizer_response).toBe("Genuine reply.");
  });

  it("lets the organizer delete their own reply (idempotent)", async () => {
    await respondToEventReviewCore(
      organizer.client,
      organizer.id,
      reviewId,
      "Genuine reply.",
    );

    const first = await deleteEventReviewResponseCore(
      organizer.client,
      organizer.id,
      reviewId,
    );
    expect(first.status).toBe(200);

    const { data: row } = await service
      .from("event_review")
      .select("organizer_response, organizer_response_at")
      .eq("id", reviewId)
      .single();
    expect(row?.organizer_response).toBeNull();
    expect(row?.organizer_response_at).toBeNull();

    // Deleting again is still a success.
    const second = await deleteEventReviewResponseCore(
      organizer.client,
      organizer.id,
      reviewId,
    );
    expect(second.status).toBe(200);
  });
});
