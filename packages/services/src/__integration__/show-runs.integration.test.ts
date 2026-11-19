import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Runs of shows and copying a listing (migration 20261119210000,
// docs/architecture/show-runs.md): each show is a whole event made from
// the listing by event_add_show; lists and search show a run once; the
// show picker reads get_event_shows.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addEventShowsCore } from "../events/eventShowsCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(3);
  return {
    title: `Run Test ${crypto.randomUUID().slice(0, 6)}`,
    description: "Created by the show runs suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 100,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    multipleTickets: [
      { type: "Regular", price: 300, quantity: 60 },
      { type: "VIP", price: 600, quantity: null },
    ],
    promoCodes: [
      {
        promoCode: "RUNLOYAL",
        discount: 25,
        maximumUse: 10,
        expiryDate: inDays(2).toISOString(),
      },
    ],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("runs of shows", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let other: TestUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, other] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
  });

  afterAll(async () => {
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await service
      .from("event_series")
      .delete()
      .eq("organizer_id", organizer.id);
    await Promise.all(
      [organizer, other].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("adds a weekly run of shows, each a whole event, listed once", async () => {
    const input = baseInput();
    const created = await postEventCore(organizer.client, organizer.id, input);
    expect(created.status, "message" in created ? created.message : "").toBe(
      200,
    );
    if (created.status !== 200) return;
    const sourceId = created.eventId;

    // A ticket was sold on the first show: the copies still get the full 60.
    const { data: regular } = await service
      .from("ticket_type")
      .select("id, quantity")
      .eq("event_id", sourceId)
      .eq("type", "Regular")
      .single();
    await service
      .from("ticket_type")
      .update({ quantity: (regular?.quantity ?? 0) - 1 })
      .eq("id", regular?.id as string);
    await service.from("ticket").insert({
      user_id: other.id,
      ticket_type_id: regular?.id as string,
      status: "active",
      qr_public_id: "test/qr",
      qr_version: "1",
      expires_at: inDays(4).toISOString(),
      ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
    });

    // Two weeks of Fridays at 16:00 and Saturdays at 16:00 and 20:00.
    const from = inDays(7);
    const until = inDays(20);
    const requestId = crypto.randomUUID();
    const rule = {
      fromDate: ymd(from),
      untilDate: ymd(until),
      slots: [
        { weekday: 5 as const, time: "16:00" },
        { weekday: 6 as const, time: "16:00" },
        { weekday: 6 as const, time: "20:00" },
      ],
      durationMinutes: 150,
    };
    const added = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: sourceId,
      rule,
      clientRequestId: requestId,
    });
    expect(added.status, "message" in added ? added.message : "").toBe(200);
    if (added.status !== 200) return;
    const count = added.data.shows.length;
    expect(count).toBeGreaterThanOrEqual(5);

    // A retry of the same submission makes nothing twice.
    const again = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: sourceId,
      rule,
      clientRequestId: requestId,
    });
    expect(again.status).toBe(200);
    if (again.status === 200) {
      expect(again.data.shows.map((s) => s.id).sort()).toEqual(
        added.data.shows.map((s) => s.id).sort(),
      );
    }

    // Every show is a whole event in one run.
    const { data: source } = await service
      .from("event")
      .select("series_id, title")
      .eq("id", sourceId)
      .single();
    expect(source?.series_id).toBeTruthy();
    const { data: shows, error: showsError } = await service
      .from("event")
      .select(
        "id, series_id, title, capacity, timezone, ticket_type(type, quantity, price), promo_code!promo_code_event_id_fkey(promo_code, times_used)",
      )
      .eq("series_id", source?.series_id as string);
    expect(showsError?.message ?? null).toBeNull();
    expect(shows).toHaveLength(count + 1);
    const copy = (shows ?? []).find((s) => s.id === added.data.shows[0].id);
    expect(copy).toMatchObject({ title: source?.title, capacity: 100 });
    expect(
      [...(copy?.ticket_type ?? [])].sort((a, b) =>
        String(a.type).localeCompare(String(b.type)),
      ),
    ).toEqual([
      { type: "Regular", quantity: 60, price: 300 },
      { type: "VIP", quantity: null, price: 600 },
    ]);
    expect(copy?.promo_code).toEqual([
      { promo_code: "RUNLOYAL", times_used: 0 },
    ]);

    // The show picker lists the run's upcoming shows, earliest first.
    const { data: picker } = await other.client.rpc("get_event_shows", {
      p_event_id: sourceId,
    });
    expect(picker).toHaveLength(count + 1);
    expect(picker?.[0].id).toBe(sourceId);
    // Capacity 100, nobody attending yet (the test sale above has no seat).
    expect(picker?.[0].seats_left).toBe(100);

    // Lists and search show the run once.
    const { data: listed } = await service.rpc("search_events", {
      p_query: input.title,
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
    } as unknown as Database["public"]["Functions"]["search_events"]["Args"]);
    expect((listed ?? []).map((r: { id: string }) => r.id)).toEqual([sourceId]);

    // A date filter finds the run by the show inside it.
    const { data: later } = await service.rpc("search_events", {
      p_query: input.title,
      p_lat: null,
      p_lng: null,
      p_radius_km: null,
      p_category: null,
      p_types: null,
      p_min_price: null,
      p_max_price: null,
      p_start_date: inDays(6).toISOString(),
      p_end_date: inDays(21).toISOString(),
      p_min_rating: null,
      p_organizer_id: null,
      p_as_of: null,
      p_cursor_score: null,
      p_cursor_id: null,
      p_page_size: 20,
    } as unknown as Database["public"]["Functions"]["search_events"]["Args"]);
    expect(later).toHaveLength(1);
    expect((later ?? [])[0].id).not.toBe(sourceId);

    // Clients cannot move an event into a run.
    const move = await organizer.client
      .from("event")
      .update({ series_id: null })
      .eq("id", sourceId);
    expect(move.error?.message ?? "").toMatch(/managed by Abonten/);
  });

  it("makes a separate copy on a new date, and refuses what it should", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    if (created.status !== 200) throw new Error("event not created");

    const start = inDays(30);
    const copy = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: created.eventId,
      shows: [
        {
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
        },
      ],
      separate: true,
      clientRequestId: crypto.randomUUID(),
    });
    expect(copy.status, "message" in copy ? copy.message : "").toBe(200);
    if (copy.status !== 200) return;
    const { data: row } = await service
      .from("event")
      .select("series_id, starts_at")
      .eq("id", copy.data.shows[0].id)
      .single();
    expect(row?.series_id).toBeNull();
    expect(new Date(row?.starts_at as string).getTime()).toBe(start.getTime());

    // Not the organizer's listing.
    const stranger = await addEventShowsCore(other.client, other.id, {
      eventId: created.eventId,
      shows: [
        {
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
        },
      ],
      clientRequestId: crypto.randomUUID(),
    });
    expect(stranger.status).toBe(404);

    // A show in the past.
    const past = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: created.eventId,
      shows: [
        {
          startsAt: inDays(-1).toISOString(),
          endsAt: inDays(-0.9).toISOString(),
        },
      ],
      clientRequestId: crypto.randomUUID(),
    });
    expect(past.status).toBe(400);

    // Clients cannot call the copy function themselves.
    const direct = await organizer.client.rpc("event_add_show", {
      p_source: created.eventId,
      p_starts_at: start.toISOString(),
      p_ends_at: new Date(start.getTime() + 3_600_000).toISOString(),
      p_event_code: "NOPE1234",
      p_slug: "nope",
      p_client_request_id: crypto.randomUUID(),
    });
    expect(direct.error).not.toBeNull();
  });
});
