import type { Database } from "@abonten/types/database.types";
import type { DiscoveryProgram } from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  resetDiscoverySettingsCache,
  resolveDiscoveryAccess,
} from "../search/discoveryProgram";
import {
  recordSearchClickCore,
  searchCore,
  suggestCore,
} from "../search/searchCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Unified search (migration 20260913090000) against a real local stack:
// ranking order, visibility (drafts, hidden, removed, archived, ended,
// suspended organizers never surface), "@handle" organizer mode, typo
// tolerance, stable score-cursor paging, hostile input, the privacy of the
// search log, and the programme gate.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["discovery_program_setting"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;
const anon = createClient<Database>(
  process.env.SUPABASE_TEST_URL as string,
  process.env.SUPABASE_TEST_ANON_KEY as string,
  { auth: { persistSession: false } },
);

// A unique token keeps these fixtures apart from anything else in the DB.
const TOKEN = `zq${Date.now().toString(36)}`;
const LAT = 5.6037;
const LNG = -0.187;

const ON: DiscoveryProgram = {
  searchV2: true,
  organizerSearch: true,
  placeSearch: true,
  personalization: false,
  prompts: false,
};

let organizer: TestUser;
let quietOrganizer: TestUser;
let suspended: TestUser;
let fan: TestUser;
let original: SettingsRow;
const eventIds: string[] = [];
const placeIds: string[] = [];

async function makeEvent(opts: {
  organizerId: string;
  title: string;
  description?: string;
  category?: string;
  startsInHours: number;
  lat?: number;
  lng?: number;
  price?: number;
  status?: "published" | "draft";
}): Promise<string> {
  const startsAt = new Date(Date.now() + opts.startsInHours * 3_600_000);
  const { data, error } = await svc.rpc("create_event", {
    p_client_request_id: crypto.randomUUID(),
    p_organizer_id: opts.organizerId,
    p_title: opts.title,
    p_slug: `${opts.title.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
    p_description:
      opts.description ??
      "An integration test event with a long enough description to count as complete.",
    p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    p_event_category: opts.category ?? "Music & Concerts",
    p_event_type: ["Live Concerts"],
    p_latitude: opts.lat ?? LAT,
    p_longitude: opts.lng ?? LNG,
    p_address: { full_address: "Labadi Beach, Accra, Ghana" },
    p_capacity: 100,
    p_website_url: null,
    p_flyer_public_id: "test/flyer",
    p_flyer_version: "1",
    p_starts_at: startsAt.toISOString(),
    p_ends_at: new Date(startsAt.getTime() + 4 * 3_600_000).toISOString(),
    p_require_registration: false,
    p_featured: false,
    p_specific_dates: null,
    p_ticket_types: [
      {
        type: "General",
        price: opts.price ?? 50,
        currency: "GHS",
        quantity: 50,
        available_from: null,
        available_until: null,
      },
    ],
    p_promo_codes: null,
    p_receiving_account: null,
    p_place_id: null,
  } as unknown as Database["public"]["Functions"]["create_event"]["Args"]);
  if (error || !data) throw new Error(`create_event failed: ${error?.message}`);
  const id = data as unknown as string;
  eventIds.push(id);
  await svc
    .from("event")
    .update({ status: opts.status ?? "published" })
    .eq("id", id);
  return id;
}

async function makePlace(
  ownerId: string,
  name: string,
  description: string,
): Promise<string> {
  const { data, error } = await svc
    .from("place")
    .insert({
      owner_id: ownerId,
      name,
      slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
      description,
      category_id: 1,
      location: `SRID=4326;POINT(${LNG} ${LAT})`,
      address: { full_address: "Oxford Street, Osu, Accra" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status: "published",
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`place insert failed: ${error.message}`);
  placeIds.push(data.id);
  return data.id;
}

beforeAll(async () => {
  const service = getServiceClient();
  organizer = await createTestUser(service);
  quietOrganizer = await createTestUser(service);
  suspended = await createTestUser(service);
  fan = await createTestUser(service);

  await svc
    .from("user_info")
    .update({
      username: `${TOKEN}_hub`,
      full_name: "Harmattan Sounds",
      organizer_verified: true,
    })
    .eq("id", organizer.id);
  await svc
    .from("user_info")
    .update({ username: `${TOKEN}_quiet`, full_name: "Quiet Collective" })
    .eq("id", quietOrganizer.id);
  await svc
    .from("user_info")
    .update({ username: `${TOKEN}_banned`, full_name: "Banned Promoter" })
    .eq("id", suspended.id);
  await svc
    .from("user_info")
    .update({ username: `${TOKEN}_fan` })
    .eq("id", fan.id);

  const { data } = await svc
    .from("discovery_program_setting")
    .select("*")
    .eq("id", 1)
    .single();
  original = data as SettingsRow;
});

afterAll(async () => {
  await svc
    .from("discovery_program_setting")
    .update(original as never)
    .eq("id", 1);
  resetDiscoverySettingsCache();
  if (eventIds.length) await svc.from("event").delete().in("id", eventIds);
  if (placeIds.length) await svc.from("place").delete().in("id", placeIds);
  await svc.from("search_query_log").delete().like("query_norm", `%${TOKEN}%`);
  const service = getServiceClient();
  for (const u of [organizer, quietOrganizer, suspended, fan]) {
    if (u) await deleteTestUser(service, u.id);
  }
});

describe("unified search", () => {
  let exact: string;
  let prefix: string;
  let described: string;

  beforeAll(async () => {
    exact = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Jazz`,
      startsInHours: 72,
    });
    prefix = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Jazz Festival Weekend`,
      startsInHours: 72,
    });
    described = await makeEvent({
      organizerId: quietOrganizer.id,
      title: "Sunday Brunch",
      description: `Brunch with a ${TOKEN} jazz trio in the garden, food and cocktails all afternoon.`,
      startsInHours: 72,
    });
    await makePlace(
      organizer.id,
      `${TOKEN} Jazz Corner`,
      "Live jazz every Friday with cocktails and small plates.",
    );
  });

  it("ranks exact title above prefix above a description-only match", async () => {
    const { data, error } = await anon.rpc("search_events", {
      p_query: `${TOKEN} jazz`,
    });
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids.indexOf(exact)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(exact)).toBeLessThan(ids.indexOf(prefix));
    expect(ids.indexOf(prefix)).toBeLessThan(ids.indexOf(described));
    for (const row of data ?? []) {
      expect(Number(row.score)).toBeGreaterThan(0);
      expect(Number(row.score)).toBeLessThan(1.5);
    }
  });

  it("is case-insensitive and tolerates a typo", async () => {
    const upper = await anon.rpc("search_events", {
      p_query: `${TOKEN.toUpperCase()} JAZZ FESTIVAL`,
    });
    expect((upper.data ?? []).map((r) => r.id)).toContain(prefix);

    const typo = await anon.rpc("search_events", {
      p_query: `${TOKEN} jazz festval weekend`,
    });
    expect((typo.data ?? []).map((r) => r.id)).toContain(prefix);
  });

  it("lets a brand-new event with no attendance compete with a popular one", async () => {
    const popular = await makeEvent({
      organizerId: quietOrganizer.id,
      title: `${TOKEN} Rooftop Party`,
      startsInHours: 48,
    });
    await svc
      .from("event")
      .update({
        created_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
      })
      .eq("id", popular);
    const buyers = await Promise.all(
      [1, 2, 3].map(() => createTestUser(getServiceClient())),
    );
    for (const b of buyers) {
      await svc.from("attendance").insert({
        user_id: b.id,
        event_id: popular,
        number_of_tickets: 20,
        status: "attending",
      } as never);
    }
    const fresh = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Rooftop Party`,
      startsInHours: 48,
    });

    const { data } = await anon.rpc("search_events", {
      p_query: `${TOKEN} rooftop party`,
    });
    const rows = data ?? [];
    const freshRow = rows.find((r) => r.id === fresh);
    const popularRow = rows.find((r) => r.id === popular);
    expect(freshRow?.is_new).toBe(true);
    expect(popularRow?.is_new).toBe(false);
    // Popularity is capped: the gap must stay small either way.
    expect(
      Math.abs(Number(freshRow?.score) - Number(popularRow?.score)),
    ).toBeLessThan(0.1);
    for (const b of buyers) await deleteTestUser(getServiceClient(), b.id);
  });

  it("never returns drafts, hidden, removed, archived or ended events", async () => {
    const draft = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Hidden Gem Draft`,
      startsInHours: 24,
      status: "draft",
    });
    const hidden = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Hidden Gem Moderated`,
      startsInHours: 24,
    });
    const removed = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Hidden Gem Removed`,
      startsInHours: 24,
    });
    const archived = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Hidden Gem Archived`,
      startsInHours: 24,
    });
    const ended = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Hidden Gem Ended`,
      startsInHours: -10,
    });
    await svc
      .from("event")
      .update({ moderation_state: "hidden" })
      .eq("id", hidden);
    await svc
      .from("event")
      .update({ moderation_state: "removed" })
      .eq("id", removed);
    await svc
      .from("event")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", archived);
    const visible = await makeEvent({
      organizerId: organizer.id,
      title: `${TOKEN} Hidden Gem Live`,
      startsInHours: 24,
    });

    const bad = [draft, hidden, removed, archived, ended];
    const results = await anon.rpc("search_events", {
      p_query: `${TOKEN} hidden gem`,
    });
    const ids = (results.data ?? []).map((r) => r.id);
    expect(ids).toContain(visible);
    for (const id of bad) expect(ids).not.toContain(id);

    const suggest = await anon.rpc("search_suggest", {
      p_query: `${TOKEN} hidden gem`,
    });
    const suggestIds = (suggest.data ?? []).map((r) => r.id);
    for (const id of bad) expect(suggestIds).not.toContain(id);

    const legacy = await anon.rpc("get_event_suggestions", {
      p_search_text: `${TOKEN} hidden gem`,
      p_limit: 20,
    });
    const legacyIds = (legacy.data ?? []).map((r) => r.id);
    expect(legacyIds).toContain(visible);
    for (const id of bad) expect(legacyIds).not.toContain(id);
  });

  it("finds organizers by @handle, case-insensitively, without duplicates", async () => {
    const { data } = await anon.rpc("search_suggest", {
      p_query: `@${TOKEN.toUpperCase()}`,
    });
    const organizers = (data ?? []).filter(
      (r) => r.entity_type === "organizer",
    );
    const labels = organizers.map((r) => r.label);
    expect(labels).toContain(`${TOKEN}_hub`);
    expect(labels).toContain(`${TOKEN}_quiet`);
    // No public event or place: not an organizer.
    expect(labels).not.toContain(`${TOKEN}_fan`);
    expect(new Set(organizers.map((r) => r.id)).size).toBe(organizers.length);
    // "@" mode returns organizers only.
    expect((data ?? []).every((r) => r.entity_type === "organizer")).toBe(true);
    // Exact handle first.
    const exactHandle = await anon.rpc("search_organizers", {
      p_query: `@${TOKEN}_hub`,
    });
    expect(exactHandle.data?.[0]?.username).toBe(`${TOKEN}_hub`);
    expect(exactHandle.data?.[0]?.organizer_verified).toBe(true);
  });

  it("hides suspended organizers even on an exact handle", async () => {
    await makeEvent({
      organizerId: suspended.id,
      title: `${TOKEN} Banned Show`,
      startsInHours: 24,
    });
    await svc.from("user_info").update({ status_id: 2 }).eq("id", suspended.id);
    const { data } = await anon.rpc("search_organizers", {
      p_query: `@${TOKEN}_banned`,
    });
    expect((data ?? []).map((r) => r.id)).not.toContain(suspended.id);
    await svc.from("user_info").update({ status_id: 1 }).eq("id", suspended.id);
  });

  it("scopes events to one organizer, with or without text", async () => {
    const all = await anon.rpc("search_events", {
      p_query: "",
      p_organizer_id: quietOrganizer.id,
    });
    const ids = (all.data ?? []).map((r) => r.id);
    expect(ids).toContain(described);
    expect(ids).not.toContain(exact);
  });

  it("matches places by name and by category", async () => {
    const byName = await anon.rpc("search_places", {
      p_query: `${TOKEN} jazz corner`,
      p_lat: LAT,
      p_lng: LNG,
    });
    expect(byName.error).toBeNull();
    expect(byName.data?.[0]?.name).toBe(`${TOKEN} Jazz Corner`);
    expect(Number(byName.data?.[0]?.score)).toBeGreaterThan(0);
    expect(byName.data?.[0]?.distance_km).toBeLessThan(1);
  });

  it("pages by score without gaps or duplicates", async () => {
    for (let i = 0; i < 7; i++) {
      await makeEvent({
        organizerId: organizer.id,
        title: `${TOKEN} Paging Night ${i}`,
        startsInHours: 30 + i,
      });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      const res = await searchCore(
        anon,
        { q: `${TOKEN} paging night`, mode: "events", pageSize: 3, cursor },
        { program: ON, platform: "web", log: false, loggingEnabled: false },
      );
      expect(res.status).toBe(200);
      seen.push(...res.events.items.map((e) => e.id));
      cursor = res.events.nextCursor;
      if (!res.events.hasNextPage) break;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it("survives hostile input", async () => {
    for (const q of [
      "100% _ \\ & | ! ( ) : * ' \" <-> 😀",
      "'); drop table event; --",
      "a".repeat(5000),
      "@",
      "@@@",
      "   ",
    ]) {
      const s = await anon.rpc("search_suggest", { p_query: q });
      expect(s.error, q).toBeNull();
      const e = await anon.rpc("search_events", { p_query: q });
      expect(e.error, q).toBeNull();
      const o = await anon.rpc("search_organizers", { p_query: q });
      expect(o.error, q).toBeNull();
    }
    // Control characters (a NUL cannot even travel to Postgres) are
    // stripped before the query leaves the service.
    const nul = await searchCore(
      anon,
      { q: "\u0000jazz\u0007", mode: "all" },
      { program: ON, platform: "web", log: false, loggingEnabled: false },
    );
    expect(nul.status).toBe(200);
    expect(nul.query.normalized).toBe("jazz");
    // A literal "%" must not act as a wildcard.
    const pct = await anon.rpc("search_events", { p_query: "%%" });
    expect(pct.data ?? []).toHaveLength(0);
  });

  it("groups results for the mixed screen and logs without identifiers", async () => {
    const res = await searchCore(
      anon,
      { q: `${TOKEN} jazz`, mode: "all" },
      { program: ON, platform: "android", log: true, loggingEnabled: true },
    );
    expect(res.status).toBe(200);
    expect(res.events.items.length).toBeGreaterThan(0);
    expect(res.events.items.length).toBeLessThanOrEqual(6);
    expect(res.places.items[0]?.entityType).toBe("place");
    expect(res.organizers.items.map((o) => o.username)).toContain(
      `${TOKEN}_hub`,
    );
    expect(res.searchId).toBeGreaterThan(0);

    const { data: logRow } = await svc
      .from("search_query_log")
      .select("*")
      .eq("id", res.searchId as number)
      .single();
    expect(logRow?.query_norm).toBe(`${TOKEN} jazz`);
    expect(logRow?.platform).toBe("android");
    expect(Object.keys(logRow ?? {})).not.toContain("user_id");

    const click = await recordSearchClickCore(svc, {
      searchId: res.searchId as number,
      entityType: "event",
      entityId: res.events.items[0].id,
      rank: 0,
    });
    expect(click.status).toBe(200);
    const { data: clicked } = await svc
      .from("search_query_log")
      .select("clicked_type, clicked_rank")
      .eq("id", res.searchId as number)
      .single();
    expect(clicked?.clicked_type).toBe("event");

    // Nobody but the service role may read or write the log.
    const read = await fan.client
      .from("search_query_log")
      .select("id")
      .limit(1);
    expect(read.error?.code).toBe("42501");
    const write = await fan.client.rpc("search_log_record", {
      p_platform: "web",
      p_surface: "all",
      p_query: "x",
      p_has_location: false,
      p_has_filters: false,
      p_event_count: 0,
      p_place_count: 0,
      p_organizer_count: 0,
      p_latency_ms: 1,
    });
    expect(write.error).not.toBeNull();
  });

  it("returns suggestions grouped by type", async () => {
    const res = await suggestCore(anon, { q: `${TOKEN} jazz` }, ON);
    expect(res.status).toBe(200);
    expect(res.events.length).toBeGreaterThan(0);
    expect(res.places.map((p) => p.label)).toContain(`${TOKEN} Jazz Corner`);
    expect(res.events.length).toBeLessThanOrEqual(6);
  });

  it("follows the programme switches and fails closed", async () => {
    await svc
      .from("discovery_program_setting")
      .update({ search_v2_enabled: false })
      .eq("id", 1);
    resetDiscoverySettingsCache();
    expect((await resolveDiscoveryAccess(svc, fan.id)).program.searchV2).toBe(
      false,
    );

    await svc
      .from("discovery_program_setting")
      .update({ search_v2_enabled: true, search_audience: "staff" })
      .eq("id", 1);
    resetDiscoverySettingsCache();
    expect((await resolveDiscoveryAccess(svc, fan.id)).program.searchV2).toBe(
      false,
    );
    expect((await resolveDiscoveryAccess(svc, null)).program.searchV2).toBe(
      false,
    );

    await svc
      .from("discovery_program_setting")
      .update({ search_audience: "beta", beta_user_ids: [fan.id] })
      .eq("id", 1);
    resetDiscoverySettingsCache();
    expect((await resolveDiscoveryAccess(svc, fan.id)).program.searchV2).toBe(
      true,
    );
    expect(
      (await resolveDiscoveryAccess(svc, organizer.id)).program.searchV2,
    ).toBe(false);

    await svc
      .from("discovery_program_setting")
      .update({ search_audience: "all", place_search_enabled: false })
      .eq("id", 1);
    resetDiscoverySettingsCache();
    const anonAccess = await resolveDiscoveryAccess(svc, null);
    expect(anonAccess.program.searchV2).toBe(true);
    expect(anonAccess.program.placeSearch).toBe(false);

    process.env.SEARCH_V2_KILL_SWITCH = "true";
    expect((await resolveDiscoveryAccess(svc, null)).program.searchV2).toBe(
      false,
    );
    process.env.SEARCH_V2_KILL_SWITCH = "";

    const blocked = await searchCore(
      anon,
      { q: "jazz", mode: "all" },
      {
        program: { ...ON, searchV2: false },
        platform: "web",
        log: false,
        loggingEnabled: false,
      },
    );
    expect(blocked.status).toBe(403);
  });
});
