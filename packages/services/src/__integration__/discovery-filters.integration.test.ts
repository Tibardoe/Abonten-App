import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Two defects in the discovery RPCs, both fixed by migration 20260909130000:
//
//  1. event.archived_at (the DATA-006 soft-delete for an expired event that
//     can't be hard-deleted because it carries transaction history) was never
//     read by any discovery RPC. Archiving only appeared to work because the
//     cron that calls it acts on past events, which the date predicates already
//     excluded — archiving a FUTURE event left it fully visible.
//
//  2. get_filtered_events read ratings from `review.reviewed_id`, which is an
//     organizer (a person), not an event. Event reviews live in event_review,
//     so the join never matched: avg_rating was always 0 and p_min_rating —
//     the Explore sheet's "From 4 stars" chip — filtered nothing at all.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// createTestEventWithTicketType places its events here.
const LAT = 5.6037;
const LNG = -0.187;

describe("discovery RPCs: archived events and event ratings", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let reviewer: TestUser;
  let eventId: string;

  beforeEach(async () => {
    service = getServiceClient();
    // These RPCs page by starts_at, and every fixture event is created at the
    // same coordinates with the same +1 day start. Runs that died before their
    // afterEach leave rows behind, and enough of them push this test's event
    // past the page limit. Drop the stale ones so the assertions are about the
    // filters and not about how many previous runs crashed. Local stack only.
    await service
      .from("event")
      .delete()
      .eq("title", "Integration Test Event")
      .lt("created_at", new Date(Date.now() - 30 * 60_000).toISOString());

    organizer = await createTestUser(service);
    reviewer = await createTestUser(service);
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 25,
    });
    eventId = fixture.eventId;
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    for (const u of [organizer, reviewer]) await deleteTestUser(service, u.id);
  });

  async function nearbyIds(): Promise<string[]> {
    const { data, error } = await service.rpc("get_nearby_events", {
      user_lat: LAT,
      user_lng: LNG,
      search_radius: 50_000,
      p_cursor_sort_key: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    if (error) throw new Error(error.message);
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  async function filtered(
    minRating: number | null,
  ): Promise<{ id: string; avg_rating: number }[]> {
    const { data, error } = await service.rpc("get_filtered_events", {
      p_min_price: null,
      p_max_price: null,
      p_start_date: null,
      p_end_date: null,
      p_user_lat: LAT,
      p_user_lng: LNG,
      p_max_distance_km: 50,
      p_search_text: null,
      p_event_category: null,
      p_event_type: null,
      p_min_rating: minRating,
      p_cursor_starts_at: null,
      p_cursor_distance_km: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; avg_rating: number }[];
  }

  async function windowIds(): Promise<string[]> {
    const { data, error } = await service.rpc("get_events_in_window", {
      p_user_lat: LAT,
      p_user_lng: LNG,
      p_radius_km: 50,
      p_window_start: new Date(Date.now() - 86_400_000).toISOString(),
      p_window_end: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      p_cursor_starts_at: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    if (error) throw new Error(error.message);
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  async function addReview(rating: number, over: Record<string, unknown> = {}) {
    const { error } = await service.from("event_review").insert({
      event_id: eventId,
      reviewer_id: reviewer.id,
      rating,
      status: "approved",
      ...over,
    });
    if (error) throw new Error(error.message);
  }

  async function archive() {
    const { error } = await service
      .from("event")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) throw new Error(error.message);
  }

  it("lists a live future event in all three discovery RPCs", async () => {
    expect(await nearbyIds()).toContain(eventId);
    expect(await windowIds()).toContain(eventId);
    expect((await filtered(null)).map((r) => r.id)).toContain(eventId);
  });

  it("drops an archived event from get_nearby_events", async () => {
    await archive();
    expect(await nearbyIds()).not.toContain(eventId);
  });

  it("drops an archived event from get_events_in_window", async () => {
    await archive();
    expect(await windowIds()).not.toContain(eventId);
  });

  it("drops an archived event from get_filtered_events", async () => {
    await archive();
    expect((await filtered(null)).map((r) => r.id)).not.toContain(eventId);
  });

  it("reports avg_rating from event_review, not the organizer review table", async () => {
    await addReview(5);
    const row = (await filtered(null)).find((r) => r.id === eventId);
    expect(Number(row?.avg_rating)).toBe(5);
  });

  it("keeps an event that meets the minimum rating", async () => {
    await addReview(5);
    expect((await filtered(4)).map((r) => r.id)).toContain(eventId);
  });

  it("excludes an event below the minimum rating", async () => {
    // The whole point: before the fix p_min_rating was inert and this event
    // came back anyway.
    await addReview(2);
    expect((await filtered(4)).map((r) => r.id)).not.toContain(eventId);
  });

  it("excludes an unreviewed event from a minimum-rating search", async () => {
    expect((await filtered(4)).map((r) => r.id)).not.toContain(eventId);
  });

  it("ignores a hidden review when averaging", async () => {
    // Same public-visibility predicate get_event_rating uses, so a list rating
    // and a detail rating agree.
    await addReview(5, { moderation_state: "hidden" });
    const row = (await filtered(null)).find((r) => r.id === eventId);
    expect(Number(row?.avg_rating)).toBe(0);
  });

  it("ignores a review that is not approved", async () => {
    await addReview(5, { status: "pending" });
    const row = (await filtered(null)).find((r) => r.id === eventId);
    expect(Number(row?.avg_rating)).toBe(0);
  });

  // Migration 20260910163552 rewrote the discovery RPCs for planning cost
  // (SECURITY DEFINER, one lateral per table) and made get_nearby_events
  // return the availability figures the cards need inline. These pin the
  // behaviour that rewrite must not have changed, plus the new columns.

  async function nearbyRows(): Promise<
    {
      id: string;
      attendance_count: number | string;
      ticket_types:
        | { price: number; currency: string; quantity: number | null }[]
        | null;
      min_price: number | string | null;
    }[]
  > {
    const { data, error } = await service.rpc("get_nearby_events", {
      user_lat: LAT,
      user_lng: LNG,
      search_radius: 50_000,
      p_cursor_sort_key: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as never;
  }

  it("get_nearby_events returns attendance and per-tier stock inline", async () => {
    const row = (await nearbyRows()).find((r) => r.id === eventId);
    expect(row).toBeDefined();
    expect(Number(row?.attendance_count)).toBe(0);
    expect(Array.isArray(row?.ticket_types)).toBe(true);
    expect(row?.ticket_types).toHaveLength(1);
    expect(Number(row?.ticket_types?.[0]?.price)).toBe(25);
    expect(row?.ticket_types?.[0]?.quantity).toBe(10);
    expect(Number(row?.min_price)).toBe(25);
  });

  it("get_filtered_events price range keeps a tier inside it and drops one outside", async () => {
    const inRange = await service.rpc("get_filtered_events", {
      p_min_price: 20,
      p_max_price: 30,
      p_start_date: null,
      p_end_date: null,
      p_user_lat: LAT,
      p_user_lng: LNG,
      p_max_distance_km: 50,
      p_search_text: null,
      p_event_category: null,
      p_event_type: null,
      p_min_rating: null,
      p_cursor_starts_at: null,
      p_cursor_distance_km: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    expect(inRange.error).toBeNull();
    expect(
      ((inRange.data ?? []) as { id: string }[]).map((r) => r.id),
    ).toContain(eventId);

    const outOfRange = await service.rpc("get_filtered_events", {
      p_min_price: 100,
      p_max_price: 200,
      p_start_date: null,
      p_end_date: null,
      p_user_lat: LAT,
      p_user_lng: LNG,
      p_max_distance_km: 50,
      p_search_text: null,
      p_event_category: null,
      p_event_type: null,
      p_min_rating: null,
      p_cursor_starts_at: null,
      p_cursor_distance_km: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    expect(outOfRange.error).toBeNull();
    expect(
      ((outOfRange.data ?? []) as { id: string }[]).map((r) => r.id),
    ).not.toContain(eventId);
  });

  it("get_filtered_events matches an event by title search text", async () => {
    const { data, error } = await service.rpc("get_filtered_events", {
      p_min_price: null,
      p_max_price: null,
      p_start_date: null,
      p_end_date: null,
      p_user_lat: LAT,
      p_user_lng: LNG,
      p_max_distance_km: 50,
      p_search_text: "Integration Test",
      p_event_category: null,
      p_event_type: null,
      p_min_rating: null,
      p_cursor_starts_at: null,
      p_cursor_distance_km: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    expect(error).toBeNull();
    expect(((data ?? []) as { id: string }[]).map((r) => r.id)).toContain(
      eventId,
    );
  });

  async function similarIds(): Promise<string[]> {
    const { data: ev } = await service
      .from("event")
      .select("event_category")
      .eq("id", eventId)
      .single();
    const { data, error } = await service.rpc("get_similar_events", {
      input_category: ev?.event_category ?? "",
      input_location: `SRID=4326;POINT(${LNG} ${LAT})`,
      input_radius_km: 50,
    } as never);
    if (error) throw new Error(error.message);
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  it("get_similar_events lists a live event and drops it once archived", async () => {
    // 20260909130000 fixed the other three RPCs; get_similar_events was the
    // one left still returning archived events.
    expect(await similarIds()).toContain(eventId);
    await archive();
    expect(await similarIds()).not.toContain(eventId);
  });
});
