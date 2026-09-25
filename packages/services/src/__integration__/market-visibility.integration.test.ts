import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25), migration 20260925111100: every discovery
// function now reads the hidden countries once per query instead of calling
// listing_market_visible() for every row. This proves the rewrite kept the
// rule in each of them: a listing in a market that is not live is found by
// none, and the same listing back in Ghana is found by all — called as a
// signed-out visitor, the way the apps call them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Far from Accra, where other suites (and the perf catalogue) put listings.
const LAT = 10.0617;
const LNG = -2.5099;
const POINT = `POINT(${LNG} ${LAT})`;

type Row = { id: string };

describe("discovery hides listings in markets that are not live", () => {
  let service: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let owner: TestUser;
  let eventId: string;
  let placeId: string;
  const word = `zq${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

  beforeAll(async () => {
    service = getServiceClient();
    anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    owner = await createTestUser(service);
    ({ eventId } = await createTestEventWithTicketType(service, owner.id, {
      quantity: 10,
      price: 20,
    }));
    const { error: moveError } = await service
      .from("event")
      .update({
        title: `Wa ${word} night`,
        location: POINT,
        event_category: "Music & Concerts",
      } as never)
      .eq("id", eventId);
    if (moveError) throw new Error(moveError.message);

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
        owner_id: owner.id,
        name: `Wa ${word} lounge`,
        slug: `visibility-${word}`,
        description: "Created by the market visibility suite.",
        category_id: category?.id as number,
        location: POINT,
        address: { city: "Wa", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    if (error || !place) throw new Error(error?.message);
    placeId = (place as Row).id;
  });

  afterAll(async () => {
    await service.from("place").delete().eq("id", placeId);
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await deleteTestUser(service, owner.id);
  });

  async function moveTo(country: "GH" | "KE") {
    const timezone = country === "GH" ? "Africa/Accra" : "Africa/Nairobi";
    for (const table of ["event", "place"] as const) {
      const id = table === "event" ? eventId : placeId;
      const { error } = await service
        .from(table)
        .update({ country_code: country, timezone } as never)
        .eq("id", id);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  function has(rows: unknown, id: string): boolean {
    return ((rows ?? []) as Row[]).some((r) => r.id === id);
  }

  async function visibility(): Promise<Record<string, boolean>> {
    const now = new Date().toISOString();
    const week = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const rpc = (name: string, args: Record<string, unknown>) =>
      anon.rpc(name as never, args as never);
    const calls: Record<string, [ReturnType<typeof rpc>, string]> = {
      // (The three-argument get_nearby_events overload cannot be reached
      // through the Data API: PostgREST refuses the call as ambiguous.)
      get_nearby_events: [
        rpc("get_nearby_events", {
          user_lat: LAT,
          user_lng: LNG,
          search_radius: 5000,
          p_cursor_sort_key: null,
          p_cursor_id: null,
          p_page_size: 50,
        }),
        eventId,
      ],
      get_events_in_window: [
        rpc("get_events_in_window", {
          p_user_lat: LAT,
          p_user_lng: LNG,
          p_radius_km: 5,
          p_window_start: now,
          p_window_end: week,
          p_cursor_starts_at: null,
          p_cursor_id: null,
          p_page_size: 50,
        }),
        eventId,
      ],
      get_filtered_events: [
        rpc("get_filtered_events", {
          p_min_price: null,
          p_max_price: null,
          p_start_date: null,
          p_end_date: null,
          p_user_lat: LAT,
          p_user_lng: LNG,
          p_max_distance_km: 5,
          p_search_text: null,
          p_event_category: null,
          p_event_type: null,
          p_min_rating: null,
          p_cursor_starts_at: null,
          p_cursor_distance_km: null,
          p_cursor_id: null,
          p_page_size: 50,
        }),
        eventId,
      ],
      search_events: [
        rpc("search_events", {
          p_query: word,
          p_lat: null,
          p_lng: null,
          p_radius_km: null,
          p_category: null,
          p_types: null,
          p_min_price: null,
          p_max_price: null,
          p_start_date: null,
          p_end_date: null,
          p_min_rating: null,
          p_organizer_id: null,
          p_as_of: null,
          p_cursor_score: null,
          p_cursor_id: null,
          p_page_size: 20,
        }),
        eventId,
      ],
      get_nearby_places: [
        rpc("get_nearby_places", {
          user_lat: LAT,
          user_lng: LNG,
          search_radius: 5000,
          p_cursor_distance: null,
          p_cursor_id: null,
          p_page_size: 50,
        }),
        placeId,
      ],
      get_filtered_places: [
        rpc("get_filtered_places", {
          p_search_text: null,
          p_category_id: null,
          p_min_rating: null,
          p_open_now: null,
          p_user_lat: LAT,
          p_user_lng: LNG,
          p_max_distance_km: 5,
          p_cursor_distance: null,
          p_cursor_id: null,
          p_page_size: 50,
        }),
        placeId,
      ],
      search_places: [
        rpc("search_places", {
          p_query: word,
          p_lat: null,
          p_lng: null,
          p_radius_km: null,
          p_category_id: null,
          p_open_now: null,
          p_min_rating: null,
          p_as_of: null,
          p_cursor_score: null,
          p_cursor_id: null,
          p_page_size: 20,
        }),
        placeId,
      ],
    };
    const out: Record<string, boolean> = {};
    for (const [name, [call, id]] of Object.entries(calls)) {
      const { data, error } = await call;
      if (error) throw new Error(`${name}: ${error.message}`);
      out[name] = has(data, id);
    }
    return out;
  }

  it("finds the listings in Ghana, and nowhere once they are in a draft market", async () => {
    await moveTo("GH");
    const live = await visibility();
    expect(Object.entries(live).filter(([, seen]) => !seen)).toEqual([]);

    await moveTo("KE");
    try {
      const hidden = await visibility();
      expect(Object.entries(hidden).filter(([, seen]) => seen)).toEqual([]);
    } finally {
      await moveTo("GH");
    }
  });
});
