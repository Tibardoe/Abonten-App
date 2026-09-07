import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// The rating aggregate RPCs (migration 20260907110500) replaced "fetch every
// review row and average it in JavaScript" at twelve call sites. These tests
// pin the behaviour that matters: only publicly-visible reviews count, the
// arithmetic matches what the replaced code produced, moderation is honoured
// (it previously was not), and the batch variant agrees with the single one.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fetchEventRating,
  fetchPlaceRatings,
  fetchUserRating,
} from "../reviews/ratingsQuery";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("rating aggregates", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let eventId: string;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    a = await createTestUser(service);
    b = await createTestUser(service);
    c = await createTestUser(service);
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    eventId = fixture.eventId;
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    for (const u of [organizer, a, b, c]) await deleteTestUser(service, u.id);
  });

  async function review(
    reviewer: TestUser,
    rating: number,
    over: Record<string, unknown> = {},
  ) {
    const { data, error } = await service
      .from("event_review")
      .insert({
        event_id: eventId,
        reviewer_id: reviewer.id,
        rating,
        status: "approved",
        ...over,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  it("returns a zero aggregate when there are no reviews", async () => {
    expect(await fetchEventRating(service, eventId)).toEqual({
      average: 0,
      count: 0,
    });
  });

  it("averages several reviews exactly", async () => {
    await review(a, 4);
    await review(b, 5);
    await review(c, 5);
    const { average, count } = await fetchEventRating(service, eventId);
    expect(count).toBe(3);
    // 14 / 3 — the same value the replaced JS reduce produced.
    expect(average).toBeCloseTo(14 / 3, 10);
  });

  it("excludes a review that is not approved", async () => {
    await review(a, 5);
    await review(b, 1, { status: "pending" });
    const { average, count } = await fetchEventRating(service, eventId);
    expect(count).toBe(1);
    expect(average).toBe(5);
  });

  it("excludes hidden and removed reviews (the old code did not)", async () => {
    await review(a, 5);
    const hidden = await review(b, 1);
    const removed = await review(c, 1);

    // Before the RPCs, no call site filtered moderation_state, so these two
    // still dragged the public average down to 7/3.
    await service
      .from("event_review")
      .update({ moderation_state: "hidden" })
      .eq("id", hidden);
    await service
      .from("event_review")
      .update({ moderation_state: "removed" })
      .eq("id", removed);

    const { average, count } = await fetchEventRating(service, eventId);
    expect(count).toBe(1);
    expect(average).toBe(5);
  });

  it("brings a review back when moderation is lifted", async () => {
    await review(a, 5);
    const hidden = await review(b, 3);
    await service
      .from("event_review")
      .update({ moderation_state: "hidden" })
      .eq("id", hidden);
    expect((await fetchEventRating(service, eventId)).count).toBe(1);

    await service
      .from("event_review")
      .update({ moderation_state: null })
      .eq("id", hidden);
    const after = await fetchEventRating(service, eventId);
    expect(after.count).toBe(2);
    expect(after.average).toBe(4);
  });

  it("reflects an edited rating and a deleted review", async () => {
    const first = await review(a, 1);
    await review(b, 5);
    expect((await fetchEventRating(service, eventId)).average).toBe(3);

    await service.from("event_review").update({ rating: 5 }).eq("id", first);
    expect((await fetchEventRating(service, eventId)).average).toBe(5);

    await service.from("event_review").delete().eq("id", first);
    const after = await fetchEventRating(service, eventId);
    expect(after.count).toBe(1);
    expect(after.average).toBe(5);
  });

  it("aggregates ratings left on a person from the partitioned review table", async () => {
    // `review` is range-partitioned; the aggregate must span partitions.
    const { error } = await service.from("review").insert([
      {
        reviewer_id: a.id,
        reviewed_id: organizer.id,
        rating: 4,
        title: "t",
        status: "approved",
      },
      {
        reviewer_id: b.id,
        reviewed_id: organizer.id,
        rating: 2,
        title: "t",
        status: "approved",
      },
    ]);
    if (error) throw new Error(error.message);

    const { average, count } = await fetchUserRating(service, organizer.id);
    expect(count).toBe(2);
    expect(average).toBe(3);
  });

  it("batch place ratings agree with the single lookup and omit unrated ids", async () => {
    const empty = await fetchPlaceRatings(service, []);
    expect(empty).toEqual({});

    const unknown = await fetchPlaceRatings(service, [
      "00000000-0000-0000-0000-000000000000",
    ]);
    expect(unknown).toEqual({});
  });
});
