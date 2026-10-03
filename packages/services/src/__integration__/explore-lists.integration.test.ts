import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// The Explore lists after migration 20261002180000: one rule for which
// events are on and what the filters mean, read by every list.
//
//   * get_nearby_events is soonest first (it used to give every event with
//     one date the same position, so they came in id order);
//   * a price or date filter works with one end ("Free", "From 20",
//     "Today"), a day sent without a time is that whole day, an event with
//     several dates is found by any of them, an event with no tier is free,
//     and a type is matched as a whole name;
//   * get_explore_event_sections builds the Explore rows from every event
//     in the area, with the filters applied, and leaves Featured alone;
//   * get_similar_events and get_place_events list by the same rule;
//   * a date that is over is not "happening" any more, and one that began
//     before the asked dates and is still running is;
//   * the three time rows never show the same event twice.
//
// The fixtures sit by themselves in the middle of Ghana, far from the spot
// every other suite uses, so nothing else is in range.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const LAT = 7.95;
const LNG = -1.03;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Key =
  | "festival"
  | "ongoing"
  | "today"
  | "tomorrow"
  | "free"
  | "noTiers"
  | "multi"
  | "ended"
  | "kidsTalent"
  | "talent"
  | "far";

let service: SupabaseClient<Database>;
let reader: TestUser;
let orgA: TestUser;
let orgB: TestUser;
let orgC: TestUser;
let orgD: TestUser;
const ids = {} as Record<Key, string>;
const startsAt = {} as Record<Key, string>;
let festivalEndsAt: string;
let placeId: string;
const placeIds: string[] = [];

const at = (ms: number) => new Date(Date.now() + ms).toISOString();

async function createEvent(
  key: Key,
  o: {
    organizer: TestUser;
    north: number;
    start?: number;
    end?: number;
    dates?: { start: number; end: number }[];
    tiers?: { type: string; price: number }[];
    category?: string;
    types?: string[];
  },
) {
  // create_event only takes a future single date; one that has begun or
  // ended is created ahead and moved afterwards.
  const { data, error } = await service.rpc("create_event", {
    p_client_request_id: crypto.randomUUID(),
    p_organizer_id: o.organizer.id,
    p_title: `Explore lists ${key}`,
    p_slug: `explore-lists-${key}-${crypto.randomUUID()}`,
    p_description: "Created by the integration test suite.",
    p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    p_event_category: o.category ?? "Music & Concerts",
    p_event_type: o.types ?? ["Live Concerts"],
    p_latitude: LAT + o.north,
    p_longitude: LNG,
    p_address: { full_address: "Kintampo, Ghana" },
    p_capacity: 100,
    p_website_url: null,
    p_flyer_public_id: "test/flyer",
    p_flyer_version: "1",
    p_starts_at: o.dates ? null : at(o.start ?? DAY),
    p_ends_at: o.dates ? null : at(o.end ?? (o.start ?? DAY) + 2 * HOUR),
    p_require_registration: false,
    p_featured: false,
    p_specific_dates: o.dates
      ? o.dates.map((d) => ({ start: at(d.start), end: at(d.end) }))
      : null,
    p_ticket_types:
      o.tiers === undefined
        ? [{ type: "General", price: 30, currency: "GHS", quantity: 50 }]
        : o.tiers.length === 0
          ? null
          : o.tiers.map((t) => ({ ...t, currency: "GHS", quantity: 50 })),
    p_promo_codes: null,
    p_receiving_account: null,
    p_place_id: null,
  } as unknown as Database["public"]["Functions"]["create_event"]["Args"]);
  if (error || !data) throw new Error(`create_event ${key}: ${error?.message}`);
  ids[key] = data;
  if (!o.dates) {
    const row = await service
      .from("event")
      .select("starts_at")
      .eq("id", data)
      .single();
    startsAt[key] = row.data?.starts_at as string;
  }
}

function keysOf(rows: { id: string }[] | null): string[] {
  const byId = new Map(Object.entries(ids).map(([k, v]) => [v, k]));
  return (rows ?? []).map((r) => byId.get(r.id) ?? r.id);
}

async function nearby(
  radiusM: number,
  cursor?: { sortKey: string; id: string },
  pageSize = 20,
) {
  const { data, error } = await reader.client.rpc("get_nearby_events", {
    user_lat: LAT,
    user_lng: LNG,
    search_radius: radiusM,
    p_cursor_sort_key: cursor?.sortKey,
    p_cursor_id: cursor?.id,
    p_page_size: pageSize,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

type FilterArgs = Partial<
  Database["public"]["Functions"]["get_filtered_events"]["Args"]
>;

async function filtered(args: FilterArgs = {}) {
  const { data, error } = await reader.client.rpc("get_filtered_events", {
    p_user_lat: LAT,
    p_user_lng: LNG,
    p_max_distance_km: 10,
    p_page_size: 50,
    ...args,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function sections(
  args: Partial<
    Database["public"]["Functions"]["get_explore_event_sections"]["Args"]
  > = {},
) {
  const { data, error } = await reader.client.rpc(
    "get_explore_event_sections",
    {
      p_user_lat: LAT,
      p_user_lng: LNG,
      p_radius_km: 10,
      p_around_km: 5,
      // "Today" for the test ends in twelve hours, so the suite reads the
      // same at any time of day.
      p_today_end: at(12 * HOUR),
      p_month_end: at(15 * DAY),
      ...args,
    },
  );
  if (error) throw new Error(error.message);
  const out: Record<string, string[]> = {};
  const byId = new Map(Object.entries(ids).map(([k, v]) => [v, k]));
  for (const row of data ?? []) {
    for (const [name, position] of Object.entries(
      row.sections as Record<string, number>,
    )) {
      out[name] ??= [];
      out[name][position - 1] = byId.get(row.id) ?? row.id;
    }
  }
  return { rows: data ?? [], bySection: out };
}

beforeAll(async () => {
  service = getServiceClient();
  [reader, orgA, orgB, orgC, orgD] = await Promise.all([
    createTestUser(service),
    createTestUser(service),
    createTestUser(service),
    createTestUser(service),
    createTestUser(service),
  ]);

  // Nearest to farthest: within 5 km, within 10 km, well outside.
  await createEvent("festival", { organizer: orgC, north: 0.013 });
  await createEvent("ongoing", { organizer: orgA, north: 0.01 });
  await createEvent("today", {
    organizer: orgA,
    north: 0.012,
    start: 2 * HOUR,
  });
  await createEvent("tomorrow", {
    organizer: orgB,
    north: 0.015,
    start: 30 * HOUR,
    tiers: [{ type: "General", price: 40 }],
    category: "Food & Drink",
    types: ["Food Festivals"],
  });
  await createEvent("free", {
    organizer: orgB,
    north: 0.02,
    start: 3 * DAY,
    tiers: [{ type: "FREE", price: 0 }],
    category: "Food & Drink",
    types: ["Food Festivals"],
  });
  await createEvent("noTiers", {
    organizer: orgC,
    north: 0.025,
    start: 10 * DAY,
    tiers: [],
  });
  await createEvent("multi", {
    organizer: orgC,
    north: 0.03,
    dates: [
      { start: -DAY, end: -DAY + 2 * HOUR },
      { start: 5 * DAY, end: 5 * DAY + 2 * HOUR },
      { start: 12 * DAY, end: 12 * DAY + 2 * HOUR },
    ],
    tiers: [{ type: "General", price: 60 }],
    category: "Arts, Culture & Theatre",
    types: ["Art Exhibitions"],
  });
  await createEvent("ended", { organizer: orgC, north: 0.011 });
  await createEvent("kidsTalent", {
    organizer: orgD,
    north: 0.07,
    start: 20 * DAY,
    tiers: [
      { type: "General", price: 100 },
      { type: "VIP", price: 300 },
    ],
    category: "Family & Kids",
    types: ["Kids Talent Shows"],
  });
  await createEvent("talent", {
    organizer: orgA,
    north: 0.072,
    start: 21 * DAY,
    tiers: [{ type: "General", price: 50 }],
    category: "Entertainment & Shows",
    types: ["Talent Shows"],
  });
  await createEvent("far", { organizer: orgA, north: 0.27, start: 2 * DAY });

  // A three-day festival on its second day, one event that began an hour
  // ago and one that is over (dates moved after creation), and two
  // featured: one still ahead, one under way.
  const moved = await Promise.all([
    service
      .from("event")
      .update({ starts_at: at(-30 * HOUR), ends_at: at(40 * HOUR) })
      .eq("id", ids.festival),
    service
      .from("event")
      .update({ starts_at: at(-HOUR), ends_at: at(2 * HOUR), featured: true })
      .eq("id", ids.ongoing),
    service
      .from("event")
      .update({ starts_at: at(-5 * HOUR), ends_at: at(-2 * HOUR) })
      .eq("id", ids.ended),
    service.from("event").update({ featured: true }).eq("id", ids.talent),
  ]);
  for (const m of moved) if (m.error) throw new Error(m.error.message);
  const festival = await service
    .from("event")
    .select("starts_at, ends_at")
    .eq("id", ids.festival)
    .single();
  if (festival.error) throw new Error(festival.error.message);
  startsAt.festival = festival.data.starts_at as string;
  festivalEndsAt = festival.data.ends_at as string;

  // Organizer B is the best rated (5, 5), then D (4); A and C have none.
  const reviews = await service.from("review").insert([
    {
      reviewer_id: reader.id,
      reviewed_id: orgB.id,
      rating: 5,
      status: "approved",
      title: "Great",
    },
    {
      reviewer_id: orgA.id,
      reviewed_id: orgB.id,
      rating: 5,
      status: "approved",
      title: "Great",
    },
    {
      reviewer_id: reader.id,
      reviewed_id: orgD.id,
      rating: 4,
      status: "approved",
      title: "Good",
    },
  ] as never);
  if (reviews.error) throw new Error(reviews.error.message);

  // A place that hosts four of the events.
  const place = await service
    .from("place")
    .insert({
      country_code: "GH",
      timezone: "Africa/Accra",
      owner_id: orgA.id,
      name: "Explore Lists Venue",
      slug: `explore-lists-venue-${crypto.randomUUID()}`,
      description: "A venue for the Explore lists integration test.",
      category_id: 1,
      location: `SRID=4326;POINT(${LNG} ${LAT})`,
      address: { full_address: "Kintampo, Ghana" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status: "published",
    } as never)
    .select("id")
    .single();
  if (place.error) throw new Error(place.error.message);
  placeId = place.data.id;
  placeIds.push(placeId);
  const hosted = await service
    .from("event")
    .update({ place_id: placeId })
    .in("id", [ids.ongoing, ids.tomorrow, ids.multi, ids.ended]);
  if (hosted.error) throw new Error(hosted.error.message);
});

afterAll(async () => {
  await service.from("event").delete().in("id", Object.values(ids));
  if (placeIds.length) await service.from("place").delete().in("id", placeIds);
  for (const u of [reader, orgA, orgB, orgC, orgD]) {
    await deleteTestUser(service, u.id);
  }
});

describe("get_nearby_events", () => {
  it("lists what is on, soonest first, an event with several dates under its next one", async () => {
    const rows = await nearby(10_000);
    expect(keysOf(rows)).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
      "free",
      "multi",
      "noTiers",
      "kidsTalent",
      "talent",
    ]);
    // The whole card comes with the row.
    const tomorrow = rows.find((r) => r.id === ids.tomorrow);
    expect(tomorrow).toMatchObject({
      min_price: 40,
      currency: "GHS",
      timezone: "Africa/Accra",
      country_code: "GH",
      attendance_count: 0,
    });
    expect(tomorrow?.ticket_types).toEqual([
      { price: 40, currency: "GHS", quantity: 50 },
    ]);
    expect(Number(tomorrow?.organizer_avg_rating)).toBe(5);
    expect(tomorrow?.organizer_rating_count).toBe(2);
  });

  it("pages through every event once, in the same order", async () => {
    const seen: string[] = [];
    let cursor: { sortKey: string; id: string } | undefined;
    for (let page = 0; page < 6; page += 1) {
      const rows = await nearby(10_000, cursor, 3);
      const shown = rows.slice(0, 3);
      seen.push(...keysOf(shown));
      if (rows.length <= 3) break;
      const last = shown[shown.length - 1];
      cursor = { sortKey: last.cursor_sort_key, id: last.id };
    }
    expect(seen).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
      "free",
      "multi",
      "noTiers",
      "kidsTalent",
      "talent",
    ]);
  });

  it("keeps to the radius, and can be called with the place alone", async () => {
    expect(keysOf(await nearby(40_000))).toContain("far");
    const { data, error } = await reader.client.rpc("get_nearby_events", {
      user_lat: LAT,
      user_lng: LNG,
      search_radius: 5_000,
    });
    expect(error).toBeNull();
    expect(keysOf(data)).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
      "free",
      "multi",
      "noTiers",
    ]);
  });
});

describe("get_filtered_events: what the filters mean", () => {
  it("takes a price with one end: free, up to an amount, from an amount", async () => {
    // "Free": a tier at 0, or no tier at all.
    expect(keysOf(await filtered({ p_max_price: 0 })).sort()).toEqual(
      ["free", "noTiers"].sort(),
    );
    // "Under 50".
    expect(keysOf(await filtered({ p_max_price: 45 })).sort()).toEqual(
      ["festival", "free", "noTiers", "ongoing", "today", "tomorrow"].sort(),
    );
    // "From 100": any tier at or above it.
    expect(keysOf(await filtered({ p_min_price: 100 }))).toEqual([
      "kidsTalent",
    ]);
    // Both ends: a tier inside them. The 300 tier of kidsTalent is inside
    // 200 to 400; its 100 tier and everything else are not.
    expect(
      keysOf(await filtered({ p_min_price: 200, p_max_price: 400 })),
    ).toEqual(["kidsTalent"]);
    expect(
      keysOf(await filtered({ p_min_price: 35, p_max_price: 60 })),
    ).toEqual(["tomorrow", "multi", "talent"]);
  });

  it("reads a day sent without a time as that whole day", async () => {
    const day = startsAt.tomorrow.slice(0, 10);
    // "Today" / "Tomorrow" from the filter sheet: the same day twice.
    expect(
      keysOf(await filtered({ p_start_date: day, p_end_date: day })),
    ).toContain("tomorrow");
    // An end that is an instant is left as it is: up to the moment the
    // event starts finds it, up to the moment before does not.
    const start = new Date(startsAt.tomorrow).getTime();
    expect(
      keysOf(
        await filtered({
          p_start_date: day,
          p_end_date: new Date(start).toISOString(),
        }),
      ),
    ).toContain("tomorrow");
    expect(
      keysOf(
        await filtered({
          p_start_date: day,
          p_end_date: new Date(start - 1).toISOString(),
        }),
      ),
    ).not.toContain("tomorrow");
  });

  it("takes a date with one end", async () => {
    // From 15 days on.
    expect(keysOf(await filtered({ p_start_date: at(15 * DAY) }))).toEqual([
      "kidsTalent",
      "talent",
    ]);
    // Up to two days from now.
    expect(keysOf(await filtered({ p_end_date: at(2 * DAY) }))).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
    ]);
  });

  it("counts a date that began before the asked dates and is still running", async () => {
    // The festival began yesterday and ends in 40 hours. Asked for a
    // stretch of tomorrow it is on, and it is listed under its own start.
    const rows = await filtered({
      p_start_date: at(34 * HOUR),
      p_end_date: at(39 * HOUR),
    });
    expect(keysOf(rows)).toEqual(["festival"]);
    expect(new Date(rows[0].starts_at).getTime()).toBe(
      new Date(startsAt.festival).getTime(),
    );
    expect(new Date(rows[0].ends_at).getTime()).toBe(
      new Date(festivalEndsAt).getTime(),
    );
    // Dates that begin at the very moment it ends do not include it; a
    // moment earlier they do.
    const end = new Date(festivalEndsAt).getTime();
    expect(
      keysOf(
        await filtered({
          p_start_date: new Date(end).toISOString(),
          p_end_date: at(60 * HOUR),
        }),
      ),
    ).not.toContain("festival");
    expect(
      keysOf(
        await filtered({
          p_start_date: new Date(end - 1).toISOString(),
          p_end_date: at(60 * HOUR),
        }),
      ),
    ).toContain("festival");
    // The same for a date of an event that has several: the one five days
    // out lasts two hours, and a stretch inside those two hours finds it.
    const inside = await filtered({
      p_start_date: at(5 * DAY + HOUR),
      p_end_date: at(5 * DAY + 90 * 60_000),
    });
    expect(keysOf(inside)).toEqual(["multi"]);
  });

  it("finds an event with several dates by any of them and lists it under that date", async () => {
    const rows = await filtered({
      p_start_date: at(11 * DAY),
      p_end_date: at(13 * DAY),
    });
    expect(keysOf(rows)).toEqual(["multi"]);
    // Listed under its date inside the range (12 days out), not its next
    // one (5 days out).
    const listed = new Date(rows[0].starts_at).getTime();
    expect(Math.abs(listed - (Date.now() + 12 * DAY))).toBeLessThan(HOUR);
    const length = new Date(rows[0].ends_at).getTime() - listed;
    expect(Math.abs(length - 2 * HOUR)).toBeLessThan(1000);
    // Without dates it is listed under its next one.
    const all = await filtered();
    const next = new Date(
      all.find((r) => r.id === ids.multi)?.starts_at as string,
    ).getTime();
    expect(Math.abs(next - (Date.now() + 5 * DAY))).toBeLessThan(HOUR);
  });

  it("matches a type as a whole name and a category by its name", async () => {
    expect(keysOf(await filtered({ p_event_type: ["Talent Shows"] }))).toEqual([
      "talent",
    ]);
    expect(
      keysOf(await filtered({ p_event_type: ["Kids Talent Shows"] })),
    ).toEqual(["kidsTalent"]);
    expect(
      keysOf(
        await filtered({ p_event_type: ["Talent Shows", "Food Festivals"] }),
      ),
    ).toEqual(["tomorrow", "free", "talent"]);
    expect(
      keysOf(await filtered({ p_event_category: "food & drink" })),
    ).toEqual(["tomorrow", "free"]);
    // An empty category is no filter (the apps send "" for "all").
    expect(keysOf(await filtered({ p_event_category: "" }))).toHaveLength(9);
  });

  it("filters by the event's own rating", async () => {
    await service.from("event_review").insert({
      event_id: ids.free,
      reviewer_id: reader.id,
      rating: 5,
      status: "approved",
    });
    expect(keysOf(await filtered({ p_min_rating: 4 }))).toEqual(["free"]);
    await service.from("event_review").delete().eq("event_id", ids.free);
  });

  it("takes a point with no distance as anywhere, nearest among equals", async () => {
    const rows = await filtered({
      p_max_distance_km: undefined,
      p_page_size: 1000,
    });
    expect(keysOf(rows)).toContain("far");
    const far = rows.find((r) => r.id === ids.far);
    expect(far?.distance_km).toBeGreaterThan(25);
  });

  it("pages through the list once, with the cursor as the API sends it", async () => {
    // Soonest first, then nearest: the distance is part of the cursor and
    // travels through JSON, where a float keeps 15 digits.
    const seen: string[] = [];
    let cursor:
      | { startsAt: string; distanceKm: number; id: string }
      | undefined;
    for (let page = 0; page < 10; page += 1) {
      const rows = await filtered({
        p_page_size: 2,
        p_cursor_starts_at: cursor?.startsAt,
        p_cursor_distance_km: cursor?.distanceKm,
        p_cursor_id: cursor?.id,
      });
      const shown = rows.slice(0, 2);
      seen.push(...keysOf(shown));
      if (rows.length <= 2) break;
      const last = shown[shown.length - 1];
      cursor = {
        startsAt: last.starts_at,
        distanceKm: last.distance_km,
        id: last.id,
      };
    }
    expect(seen).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
      "free",
      "multi",
      "noTiers",
      "kidsTalent",
      "talent",
    ]);
  });

  it("returns the whole card: tiers, attendance, organizer rating", async () => {
    const rows = await filtered();
    const kids = rows.find((r) => r.id === ids.kidsTalent);
    expect(kids).toMatchObject({
      min_price: 100,
      currency: "GHS",
      attendance_count: 0,
      featured: false,
      organizer_rating_count: 1,
    });
    expect(kids?.ticket_types).toEqual([
      { price: 100, currency: "GHS", quantity: 50 },
      { price: 300, currency: "GHS", quantity: 50 },
    ]);
    // An event with no tier has no price and no tier list.
    const none = rows.find((r) => r.id === ids.noTiers);
    expect(none?.min_price).toBeNull();
    expect(none?.ticket_types).toBeNull();
  });
});

describe("get_explore_event_sections", () => {
  it("builds every row from the whole area", async () => {
    const { bySection, rows } = await sections();
    expect(bySection.aroundYou).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
      "free",
      "multi",
      "noTiers",
    ]);
    // Today: what starts by the end of it and has not ended. The festival
    // that began yesterday and the event that began an hour ago are still
    // happening; the one that ended is not.
    expect(bySection.happeningToday).toEqual(["festival", "ongoing", "today"]);
    // The next seven days, without what the row above shows.
    expect(bySection.happeningThisWeek).toEqual(["tomorrow", "free", "multi"]);
    // To the end of the month, without what the two rows above show: the
    // event with several dates has one twelve days out, and is in "this
    // week" already.
    expect(bySection.happeningThisMonth).toEqual(["noTiers"]);
    // Best-rated organizer first (B: 5 from two people), then D (4); the
    // organizers nobody has rated are not in the row.
    expect(bySection.topRatedOrganizers).toEqual([
      "tomorrow",
      "free",
      "kidsTalent",
    ]);
    // Featured needs a date still ahead: the one under way is left out.
    expect(bySection.featured).toEqual(["talent"]);
    // Each event comes once, however many rows it is in.
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.find((r) => r.id === ids.talent)?.featured).toBe(true);
  });

  it("applies the reader's filters to every row but Featured", async () => {
    const { bySection } = await sections({ p_event_category: "Food & Drink" });
    expect(bySection.aroundYou).toEqual(["tomorrow", "free"]);
    expect(bySection.happeningToday).toBeUndefined();
    expect(bySection.happeningThisWeek).toEqual(["tomorrow", "free"]);
    expect(bySection.topRatedOrganizers).toEqual(["tomorrow", "free"]);
    expect(bySection.featured).toEqual(["talent"]);

    const free = await sections({ p_max_price: 0 });
    expect(free.bySection.aroundYou).toEqual(["free", "noTiers"]);
    expect(free.bySection.featured).toEqual(["talent"]);
  });

  it("gives one row alone when asked, up to its size", async () => {
    const { bySection } = await sections({
      p_sections: ["topRatedOrganizers"],
      p_section_size: 2,
    });
    expect(Object.keys(bySection)).toEqual(["topRatedOrganizers"]);
    expect(bySection.topRatedOrganizers).toEqual(["tomorrow", "free"]);
  });

  it("gives a time row whole when it is asked for by itself", async () => {
    // Nothing is shown above it, so nothing is left out: this week starts
    // with what is on today.
    const week = await sections({ p_sections: ["happeningThisWeek"] });
    expect(Object.keys(week.bySection)).toEqual(["happeningThisWeek"]);
    expect(week.bySection.happeningThisWeek).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
      "free",
      "multi",
    ]);
    // A row that is full pushes the rest of its stretch into the next one:
    // with two cards a row, today shows two and this week begins with the
    // third event of today.
    const small = await sections({
      p_sections: ["happeningToday", "happeningThisWeek", "happeningThisMonth"],
      p_section_size: 2,
    });
    expect(small.bySection.happeningToday).toEqual(["festival", "ongoing"]);
    expect(small.bySection.happeningThisWeek).toEqual(["today", "tomorrow"]);
    expect(small.bySection.happeningThisMonth).toEqual(["free", "multi"]);
  });

  it("narrows the area, and Around you with it", async () => {
    const { bySection } = await sections({ p_radius_km: 2, p_around_km: 5 });
    expect(bySection.aroundYou).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
    ]);
    expect(bySection.featured).toBeUndefined();
  });
});

describe("get_similar_events", () => {
  const here = `SRID=4326;POINT(${LNG} ${LAT})`;

  it("lists the same category nearby, soonest first, without the event itself", async () => {
    const { data, error } = await reader.client.rpc("get_similar_events", {
      input_category: "Food & Drink",
      input_location: here,
      input_radius_km: 10,
    });
    expect(error).toBeNull();
    expect(keysOf(data)).toEqual(["tomorrow", "free"]);
    expect(data?.[0]).toMatchObject({
      ticket_price: 40,
      ticket_currency: "GHS",
      min_price: 40,
      currency: "GHS",
      attendance_count: 0,
    });

    const without = await reader.client.rpc("get_similar_events", {
      input_category: "Food & Drink",
      input_location: here,
      input_radius_km: 10,
      p_exclude_event_id: ids.tomorrow,
    });
    expect(keysOf(without.data)).toEqual(["free"]);
  });

  it("gives as many as asked and nothing for no category", async () => {
    const one = await reader.client.rpc("get_similar_events", {
      input_category: "Music & Concerts",
      input_location: here,
      input_radius_km: 10,
      p_limit: 2,
    });
    expect(keysOf(one.data)).toEqual(["festival", "ongoing"]);
    const none = await reader.client.rpc("get_similar_events", {
      input_category: "",
      input_location: here,
      input_radius_km: 10,
    });
    expect(none.data).toEqual([]);
  });
});

describe("get_events_in_window", () => {
  const inWindow = async (
    from: number,
    to: number,
    extra: Partial<
      Database["public"]["Functions"]["get_events_in_window"]["Args"]
    > = {},
  ) => {
    const { data, error } = await reader.client.rpc("get_events_in_window", {
      p_user_lat: LAT,
      p_user_lng: LNG,
      p_radius_km: 10,
      p_window_start: at(from),
      p_window_end: at(to),
      ...extra,
    });
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  it("lists what is on in the window: not a date that is over, and one still running", async () => {
    const data = await inWindow(-12 * HOUR, 12 * HOUR);
    // "ended" and "ongoing" both began inside the window; only the one
    // still on is listed. The festival began before it and is still
    // running, so it is happening too, under its own start.
    expect(keysOf(data)).toEqual(["festival", "ongoing", "today"]);
    expect(new Date(data[0].starts_at).getTime()).toBe(
      new Date(startsAt.festival).getTime(),
    );
    expect(data[1]).toMatchObject({ attendance_count: 0 });
    expect(data[1].ticket_types).toEqual([
      { price: 30, currency: "GHS", quantity: 50 },
    ]);
  });

  it("takes the window's ends as instants and pages in order", async () => {
    // A window that ends a minute after "tomorrow" starts finds it; one
    // that ends a minute before does not.
    const start = new Date(startsAt.tomorrow).getTime() - Date.now();
    expect(keysOf(await inWindow(0, start + 60_000))).toContain("tomorrow");
    expect(keysOf(await inWindow(0, start - 60_000))).not.toContain("tomorrow");

    const seen: string[] = [];
    let cursor: { startsAt: string; id: string } | undefined;
    for (let page = 0; page < 6; page += 1) {
      const rows = await inWindow(0, 8 * DAY, {
        p_page_size: 2,
        p_cursor_starts_at: cursor?.startsAt,
        p_cursor_id: cursor?.id,
      });
      const shown = rows.slice(0, 2);
      seen.push(...keysOf(shown));
      if (rows.length <= 2) break;
      const last = shown[shown.length - 1];
      cursor = { startsAt: last.starts_at, id: last.id };
    }
    expect(seen).toEqual([
      "festival",
      "ongoing",
      "today",
      "tomorrow",
      "free",
      "multi",
    ]);
  });
});

describe("get_place_events", () => {
  it("lists the events at a place that are still on, soonest first", async () => {
    const { data, error } = await reader.client.rpc("get_place_events", {
      p_place_id: placeId,
    });
    expect(error).toBeNull();
    // The one under way and the one with several dates are there (a read
    // of `event` asking for a start in the future missed both); the one
    // that ended is not.
    expect(keysOf(data)).toEqual(["ongoing", "tomorrow", "multi"]);

    const limited = await reader.client.rpc("get_place_events", {
      p_place_id: placeId,
      p_limit: 1,
    });
    expect(keysOf(limited.data)).toEqual(["ongoing"]);
  });
});

describe("place lists", () => {
  it("asks 'open now' in order of distance and keeps the nearest that are open", async () => {
    const make = async (name: string, north: number, open: boolean) => {
      const { data, error } = await service
        .from("place")
        .insert({
          country_code: "GH",
          timezone: "Africa/Accra",
          owner_id: orgA.id,
          name,
          slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
          description: "A place for the Explore lists integration test.",
          category_id: 3,
          location: `SRID=4326;POINT(${LNG} ${LAT + north})`,
          address: { full_address: "Kintampo, Ghana" },
          cover_public_id: "test/cover",
          cover_version: "1",
          status: "published",
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      placeIds.push(data.id);
      if (open) {
        // Midnight to midnight is "open around the clock".
        const hours = await service.from("place_opening_hours").insert(
          [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            place_id: data.id,
            day_of_week: day,
            open_time: "00:00",
            close_time: "00:00",
            is_closed: false,
          })) as never,
        );
        if (hours.error) throw new Error(hours.error.message);
      }
      return data.id as string;
    };
    const closedNear = await make("Explore Lists Closed Pub", 0.001, false);
    const openA = await make("Explore Lists Open Pub A", 0.002, true);
    const openB = await make("Explore Lists Open Pub B", 0.003, true);

    const list = async (
      args: Partial<
        Database["public"]["Functions"]["get_filtered_places"]["Args"]
      >,
    ) => {
      const { data, error } = await reader.client.rpc("get_filtered_places", {
        p_category_id: 3,
        p_user_lat: LAT,
        p_user_lng: LNG,
        p_max_distance_km: 5,
        ...args,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    };

    expect((await list({})).map((p) => p.id)).toEqual([
      closedNear,
      openA,
      openB,
    ]);
    const open = await list({ p_open_now: true });
    expect(open.map((p) => p.id)).toEqual([openA, openB]);
    expect(open.every((p) => p.is_open)).toBe(true);
    // One per page: the second page starts after the first open place.
    const first = await list({ p_open_now: true, p_page_size: 1 });
    expect(first.map((p) => p.id)).toEqual([openA, openB]);
    const second = await list({
      p_open_now: true,
      p_page_size: 1,
      p_cursor_distance: first[0].cursor_distance_km,
      p_cursor_id: first[0].id,
    });
    expect(second.map((p) => p.id)).toEqual([openB]);

    const near = await reader.client.rpc("get_nearby_places", {
      user_lat: LAT,
      user_lng: LNG,
      search_radius: 500,
    });
    expect(near.error).toBeNull();
    expect(
      (near.data ?? [])
        .map((p) => p.id)
        .filter((id) => [closedNear, openA, openB].includes(id)),
    ).toEqual([closedNear, openA, openB]);
  });

  it("says 'open now' exactly as place_is_open_now does, for every kind of hours", async () => {
    // The list checks opening hours itself (one index lookup a place, not
    // a function call), so the two must agree whatever the time of day.
    // Every pattern below is open or closed depending on when the suite
    // runs; what is checked is that both answers are the same.
    const utc = new Date();
    const today = utc.getUTCDay();
    const yesterday = (today + 6) % 7;
    const tomorrow = (today + 1) % 7;
    type Hours = {
      day_of_week: number;
      open_time: string | null;
      close_time: string | null;
      is_closed: boolean;
    };
    const every = (open: string, close: string): Hours[] =>
      [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day_of_week: day,
        open_time: open,
        close_time: close,
        is_closed: false,
      }));
    const patterns: {
      name: string;
      hours: Hours[];
      timezone?: string;
      temporaryStatus?: string;
    }[] = [
      { name: "around the clock", hours: every("00:00", "00:00") },
      { name: "no hours", hours: [] },
      {
        name: "closed every day",
        hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          day_of_week: day,
          open_time: null,
          close_time: null,
          is_closed: true,
        })),
      },
      { name: "day hours", hours: every("08:00", "22:00") },
      { name: "late bar", hours: every("18:00", "02:00") },
      {
        name: "overnight from yesterday",
        hours: [
          {
            day_of_week: yesterday,
            open_time: "23:59",
            close_time: "23:58",
            is_closed: false,
          },
        ],
      },
      {
        name: "closed today",
        hours: every("00:00", "00:00").map((h) =>
          h.day_of_week === today
            ? { ...h, open_time: null, close_time: null, is_closed: true }
            : h,
        ),
      },
      {
        name: "tomorrow only",
        hours: [
          {
            day_of_week: tomorrow,
            open_time: "00:00",
            close_time: "00:00",
            is_closed: false,
          },
        ],
      },
      {
        name: "temporarily closed",
        hours: every("00:00", "00:00"),
        temporaryStatus: "temporarily_closed",
      },
      {
        // Fourteen hours ahead of UTC: its day is often not Accra's.
        name: "another zone",
        hours: [
          {
            day_of_week: today,
            open_time: "00:00",
            close_time: "00:00",
            is_closed: false,
          },
        ],
        timezone: "Pacific/Kiritimati",
      },
    ];

    const created: { id: string; name: string }[] = [];
    for (const [i, pattern] of patterns.entries()) {
      const { data, error } = await service
        .from("place")
        .insert({
          country_code: "GH",
          timezone: pattern.timezone ?? "Africa/Accra",
          owner_id: orgB.id,
          name: `Explore Lists Hours ${i}`,
          slug: `explore-lists-hours-${i}-${crypto.randomUUID()}`,
          description: "A place for the open-now agreement test.",
          category_id: 5,
          location: `SRID=4326;POINT(${LNG} ${LAT + 0.02 + i * 0.0005})`,
          address: { full_address: "Kintampo, Ghana" },
          cover_public_id: "test/cover",
          cover_version: "1",
          status: "published",
          temporary_status: pattern.temporaryStatus ?? null,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(`${pattern.name}: ${error.message}`);
      placeIds.push(data.id);
      created.push({ id: data.id, name: pattern.name });
      if (pattern.hours.length > 0) {
        const hours = await service
          .from("place_opening_hours")
          .insert(
            pattern.hours.map((h) => ({ ...h, place_id: data.id })) as never,
          );
        if (hours.error)
          throw new Error(`${pattern.name}: ${hours.error.message}`);
      }
    }

    const listed = await reader.client.rpc("get_filtered_places", {
      p_category_id: 5,
      p_user_lat: LAT,
      p_user_lng: LNG,
      p_max_distance_km: 10,
      p_open_now: true,
      p_page_size: 100,
    });
    expect(listed.error).toBeNull();
    const openInList = new Set((listed.data ?? []).map((row) => row.id));
    expect((listed.data ?? []).every((row) => row.is_open)).toBe(true);

    const byFunction: Record<string, boolean> = {};
    const byList: Record<string, boolean> = {};
    for (const place of created) {
      const { data, error } = await service.rpc("place_is_open_now", {
        p_place_id: place.id,
      });
      expect(error).toBeNull();
      byFunction[place.name] = data === true;
      byList[place.name] = openInList.has(place.id);
    }
    expect(byList).toEqual(byFunction);
    // The two fixed answers, so the comparison is not of two empty lists.
    expect(byFunction["around the clock"]).toBe(true);
    expect(byFunction["no hours"]).toBe(false);
    expect(byFunction["temporarily closed"]).toBe(false);
  });
});
