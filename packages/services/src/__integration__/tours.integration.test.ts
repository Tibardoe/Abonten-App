import { groupShowsByVenue } from "@abonten/core/showRuns";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Tours (migration 20261120190000, docs/architecture/show-runs.md): a run's
// shows may be at other venues in the same country; two shows may start at
// once in two cities; a seat map stays with its hall; lists pick the show
// nearest the reader.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addEventShowsCore } from "../events/eventShowsCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import {
  getEventSeatingCore,
  saveSeatingPlanCore,
  setEventSeatingCore,
} from "../seating/seatingCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const ACCRA = { lat: 5.5566, lng: -0.1969 };
const KUMASI = { lat: 6.6885, lng: -1.6244 };
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(3);
  return {
    title: `Tour Test ${crypto.randomUUID().slice(0, 6)}`,
    description: "Created by the tours suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: ACCRA.lat,
    longitude: ACCRA.lng,
    capacity: 100,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    multipleTickets: [
      { type: "Stalls", price: 300, quantity: null },
      { type: "Balcony", price: 200, quantity: 4 },
    ],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("tours", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let fan: TestUser;
  const placeIds: string[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, fan] = await Promise.all([
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
    await service.from("seating_plan").delete().eq("owner_id", organizer.id);
    for (const id of placeIds) {
      await service.from("place").delete().eq("id", id);
    }
    await Promise.all(
      [organizer, fan].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function newPlace(name: string, over: Record<string, unknown> = {}) {
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: fan.id,
        name,
        slug: `tour-test-${crypto.randomUUID().slice(0, 8)}`,
        description: "Created by the tours suite.",
        category_id: category?.id as number,
        location: `POINT(${KUMASI.lng} ${KUMASI.lat})`,
        address: { full_address: `${name}, Kumasi`, city: "Kumasi" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        ...over,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    placeIds.push(data.id);
    return data.id as string;
  }

  it("plays two cities at once, leaves the seat map in its hall and lists the nearest show", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    expect(created.status, "message" in created ? created.message : "").toBe(
      200,
    );
    if (created.status !== 200) return;
    const sourceId = created.eventId;

    // The Accra hall has a seat map.
    const saved = await saveSeatingPlanCore(organizer.id, {
      name: "National Theatre",
      sections: [
        { name: "Stalls", rows: [{ label: "A", seats: 6 }] },
        { name: "Balcony", rows: [{ label: "C", seats: 4 }] },
      ],
    });
    if (saved.status !== 200) throw new Error("plan");
    const setup = await getEventSeatingCore(
      organizer.client,
      organizer.id,
      sourceId,
    );
    if (setup.status !== 200) throw new Error("setup");
    const [stalls, balcony] = setup.data.plans[0].sections;
    const typeId = (name: string) =>
      setup.data.ticketTypes.find((t) => t.type === name)?.id as string;
    const seated = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId: sourceId,
      planId: saved.data.planId,
      sections: {
        [typeId("Stalls")]: stalls.id,
        [typeId("Balcony")]: balcony.id,
      },
    });
    expect(seated.status).toBe(200);

    // One night in Kumasi, the same night back in Accra: same time, two
    // cities.
    const night = inDays(6);
    night.setUTCHours(19, 0, 0, 0);
    const show = {
      startsAt: night.toISOString(),
      endsAt: new Date(night.getTime() + 2 * 3_600_000).toISOString(),
    };
    const kumasi = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: sourceId,
      shows: [show],
      venue: {
        address: "Kumasi Cultural Centre, Kumasi",
        latitude: KUMASI.lat,
        longitude: KUMASI.lng,
      },
      clientRequestId: crypto.randomUUID(),
    });
    expect(kumasi.status, kumasi.message).toBe(200);
    if (kumasi.status !== 200) return;
    const kumasiId = kumasi.data.shows[0].id;

    const accra = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: sourceId,
      shows: [show],
      clientRequestId: crypto.randomUUID(),
    });
    expect(accra.status, accra.message).toBe(200);
    if (accra.status !== 200) return;
    expect(accra.data.skipped).toBe(0);
    const accraNightId = accra.data.shows[0].id;

    // A second Kumasi show at that time is the same show: skipped.
    const again = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: sourceId,
      shows: [show],
      venue: {
        address: "Kumasi Cultural Centre, Kumasi",
        latitude: KUMASI.lat + 0.0001,
        longitude: KUMASI.lng,
      },
      clientRequestId: crypto.randomUUID(),
    });
    expect(again.status).toBe(200);
    if (again.status !== 200) return;
    expect(again.data).toEqual({ shows: [], skipped: 1 });

    // The Kumasi show is at its own venue, without the Accra seat map.
    const { data: k } = await service
      .from("event")
      .select("address, place_id, timezone, country_code, series_id")
      .eq("id", kumasiId)
      .single();
    expect(k?.address).toEqual({
      full_address: "Kumasi Cultural Centre, Kumasi",
      country_code: "GH",
    });
    expect(k?.place_id).toBeNull();
    expect(k?.timezone).toBe("Africa/Accra");
    const { data: kTypes } = await service
      .from("ticket_type")
      .select("type, seating_section_id")
      .eq("event_id", kumasiId)
      .order("type");
    expect(kTypes?.map((t) => t.seating_section_id)).toEqual([null, null]);
    const { count: kSeating } = await service
      .from("event_seating")
      .select("event_id", { count: "exact", head: true })
      .eq("event_id", kumasiId);
    expect(kSeating).toBe(0);

    // The Accra night keeps the hall's seat map.
    const { count: aSeating } = await service
      .from("event_seating")
      .select("event_id", { count: "exact", head: true })
      .eq("event_id", accraNightId);
    expect(aSeating).toBe(1);

    // The picker sees two venues.
    const { data: picker } = await fan.client.rpc("get_event_shows", {
      p_event_id: sourceId,
    });
    expect(picker).toHaveLength(3);
    const groups = groupShowsByVenue(picker ?? []);
    expect(groups.map((g) => g.label)).toEqual([
      "National Theatre, Accra",
      "Kumasi Cultural Centre, Kumasi",
    ]);
    expect(groups[0].shows.map((s) => s.id)).toEqual([sourceId, accraNightId]);

    // Lists show the run once: the nearest show to the reader.
    async function listedNear(at: { lat: number; lng: number }) {
      const { data, error } = await service.rpc("get_nearby_events", {
        user_lat: at.lat,
        user_lng: at.lng,
        search_radius: 1_000_000,
        p_cursor_sort_key: null,
        p_cursor_id: null,
        p_page_size: 1000,
      } as never);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string }[])
        .map((r) => r.id)
        .filter((id) => [sourceId, kumasiId, accraNightId].includes(id));
    }
    expect(await listedNear(KUMASI)).toEqual([kumasiId]);
    expect(await listedNear(ACCRA)).toEqual([sourceId]);
  });

  it("takes an Abonten place as the venue, and refuses a hidden place or another country", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    if (created.status !== 200) throw new Error("create");
    const sourceId = created.eventId;
    const placeName = `Tour Hall ${crypto.randomUUID().slice(0, 4)}`;
    const placeId = await newPlace(placeName);

    const atPlace = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: sourceId,
      shows: [
        {
          startsAt: inDays(8).toISOString(),
          endsAt: inDays(8.1).toISOString(),
        },
      ],
      venue: { placeId },
      clientRequestId: crypto.randomUUID(),
    });
    expect(atPlace.status, atPlace.message).toBe(200);
    if (atPlace.status !== 200) return;
    const showId = atPlace.data.shows[0].id;
    const { data: row } = await service
      .from("event")
      .select("place_id, address")
      .eq("id", showId)
      .single();
    expect(row?.place_id).toBe(placeId);
    expect((row?.address as { full_address: string }).full_address).toBe(
      `${placeName}, Kumasi`,
    );
    const { data: picker } = await fan.client.rpc("get_event_shows", {
      p_event_id: sourceId,
    });
    const listed = (picker ?? []).find((s) => s.id === showId);
    expect(listed?.venue_name).toBe(placeName);
    expect(listed?.city).toBe("Kumasi");

    // A place Abonten hid takes no shows.
    const hiddenId = await newPlace(`Hidden ${placeName}`, {
      moderation_state: "hidden",
    });
    const hidden = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: sourceId,
      shows: [
        {
          startsAt: inDays(9).toISOString(),
          endsAt: inDays(9.1).toISOString(),
        },
      ],
      venue: { placeId: hiddenId },
      clientRequestId: crypto.randomUUID(),
    });
    expect(hidden.status).toBe(409);

    // Another country: the database refuses even if a caller skips the
    // service's own check.
    const { error: abroad } = await service.rpc("event_add_show", {
      p_source: sourceId,
      p_starts_at: inDays(10).toISOString(),
      p_ends_at: inDays(10.1).toISOString(),
      p_event_code: `TOUR${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
      p_slug: `tour-abroad-${crypto.randomUUID().slice(0, 8)}`,
      p_client_request_id: crypto.randomUUID(),
      p_latitude: 6.5244,
      p_longitude: 3.3792,
      p_address: { full_address: "Lagos" },
      p_country_code: "NG",
      p_timezone: "Africa/Lagos",
    });
    expect(abroad?.message).toBe(
      "A show must be in the same country as the listing.",
    );
    const viaService = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: sourceId,
      shows: [
        {
          startsAt: inDays(10).toISOString(),
          endsAt: inDays(10.1).toISOString(),
        },
      ],
      venue: { address: "Lagos", latitude: 6.5244, longitude: 3.3792 },
      clientRequestId: crypto.randomUUID(),
    });
    expect(viaService.status).not.toBe(200);
  });
});
