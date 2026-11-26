import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type {
  ShowcaseAdminEntry,
  ShowcaseHiddenReason,
} from "@abonten/types/showcaseType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// The "On Abonten" wall (migration 20261126100000, docs/architecture/
// showcase.md): who shows is decided on every read (an active account; a
// host with an upcoming event in the market that is on by the Explore rule
// and not restricted; a place that is published, visible, open, in an open
// market and run by a real owner); the programme switch and audience; the
// minimum per row; the console's add / move / remove with audit rows; the
// counting of taps and follows; and that clients reach none of it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addShowcaseEntryCore,
  getShowcaseAdminViewCore,
  moveShowcaseEntryCore,
  removeShowcaseEntryCore,
  searchShowcaseCandidatesCore,
  updateShowcaseSettingsCore,
} from "../admin/showcase/showcaseAdminCore";
import { setFollowCore } from "../content/followCore";
import { resetShowcaseSettingsCache } from "../showcase/showcaseProgram";
import {
  getShowcaseDirectoryCore,
  getShowcaseWallCore,
  recordShowcaseTapCore,
} from "../showcase/showcaseWallCore";
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

const ACCRA = { lat: 5.6037, lng: -0.187 };
const KUMASI = { lat: 6.6885, lng: -1.6244 };
const DAY = 86_400_000;

describe("the On Abonten wall", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  let anon: SupabaseClient<Database>;
  let ctx: AdminContext;
  const users: TestUser[] = [];
  const eventIds: string[] = [];
  const placeIds: string[] = [];
  const teamIds: string[] = [];
  const tag = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

  let staff: TestUser;
  let viewer: TestUser;
  let beta: TestUser;
  const host: Record<string, TestUser> = {};
  const place: Record<string, string> = {};
  let kumasiId: string;

  async function person(name: string): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    const { error } = await service
      .from("user_info")
      .update({
        username: `sc_${tag()}`,
        full_name: name,
        username_is_generated: false,
      } as never)
      .eq("id", u.id);
    expect(error, error?.message).toBeNull();
    return u;
  }

  async function upcomingEvent(
    organizerId: string,
    days = 10,
  ): Promise<string> {
    const { eventId } = await createTestEventWithTicketType(
      service,
      organizerId,
      { quantity: 50 },
    );
    eventIds.push(eventId);
    const starts = new Date(Date.now() + days * DAY);
    const { error } = await service
      .from("event")
      .update({
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + 4 * 3_600_000).toISOString(),
        status: "published",
      } as never)
      .eq("id", eventId);
    expect(error, error?.message).toBeNull();
    return eventId;
  }

  async function makePlace(
    ownerId: string,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: ownerId,
        name: `Showcase Lounge ${tag()}`,
        slug: `showcase-lounge-${crypto.randomUUID()}`,
        description: "Integration test place",
        category_id: 1,
        location: `SRID=4326;POINT(${ACCRA.lng} ${ACCRA.lat})`,
        address: { full_address: "Osu, Accra", city: "Osu" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        ...over,
      } as never)
      .select("id")
      .single();
    expect(error, error?.message).toBeNull();
    const id = (data as { id: string }).id;
    placeIds.push(id);
    return id;
  }

  async function setStatus(userId: string, statusId: number) {
    const { error } = await service
      .from("user_info")
      .update({ status_id: statusId })
      .eq("id", userId);
    expect(error, error?.message).toBeNull();
  }

  async function settings(patch: Record<string, unknown>) {
    const { error } = await service
      .from("showcase_program_setting")
      .update(patch as never)
      .eq("id", 1);
    expect(error, error?.message).toBeNull();
    resetShowcaseSettingsCache();
  }

  async function add(
    kind: "host" | "place",
    subjectId: string,
    country = "GH",
    regionId: string | null = null,
  ): Promise<string> {
    const res = await addShowcaseEntryCore(svc, ctx, {
      countryCode: country,
      subjectKind: kind,
      subjectId,
      regionId,
      note: null,
    });
    expect(res.status, res.message).toBe(200);
    return res.data?.id as string;
  }

  async function adminEntries(
    country = "GH",
  ): Promise<Map<string, ShowcaseAdminEntry>> {
    const res = await getShowcaseAdminViewCore(svc, ctx, {
      countryCode: country,
    });
    expect(res.status, res.message).toBe(200);
    return new Map((res.data?.entries ?? []).map((e) => [e.subjectId, e]));
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    // Local stack only: start from an empty wall.
    await service
      .from("showcase_entry")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    staff = await person("Showcase Staff");
    await service.from("admin_user").insert({
      user_id: staff.id,
      status: "active",
    } as never);
    viewer = await person("Showcase Viewer");
    beta = await person("Showcase Beta");

    ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: ["showcase.view", "showcase.edit"],
      reauthenticatedAt: Date.now(),
    };

    // Hosts.
    host.good = await person("Good Host");
    await upcomingEvent(host.good.id, 10);
    host.good2 = await person("Second Host");
    await upcomingEvent(host.good2.id, 12);
    host.noEvent = await person("Quiet Host");
    host.deleted = await person("Gone Host");
    await upcomingEvent(host.deleted.id);
    await setStatus(host.deleted.id, 4);
    host.banned = await person("Banned Host");
    await upcomingEvent(host.banned.id);
    await setStatus(host.banned.id, 3);
    host.suspended = await person("Suspended Host");
    await upcomingEvent(host.suspended.id);
    await setStatus(host.suspended.id, 2);
    host.postponed = await person("Postponed Host");
    {
      const id = await upcomingEvent(host.postponed.id);
      const { error } = await service
        .from("event")
        .update({ postponed_at: new Date().toISOString() } as never)
        .eq("id", id);
      expect(error, error?.message).toBeNull();
    }
    host.hidden = await person("Hidden Host");
    {
      const id = await upcomingEvent(host.hidden.id);
      await service
        .from("event")
        .update({ moderation_state: "hidden" } as never)
        .eq("id", id);
    }
    host.restricted = await person("Restricted Host");
    {
      const id = await upcomingEvent(host.restricted.id);
      await service
        .from("event")
        .update({ moderation_state: "restricted" } as never)
        .eq("id", id);
    }
    // A paused team: its account is a team whose team row is frozen.
    host.team = await person("Frozen Team");
    await upcomingEvent(host.team.id);
    await service
      .from("user_info")
      .update({ account_kind: "team" } as never)
      .eq("id", host.team.id);
    await service
      .from("team")
      .insert({ account_id: host.team.id, status: "frozen" } as never);
    teamIds.push(host.team.id);

    // Places.
    const owner = await person("Place Owner");
    place.good = await makePlace(owner.id);
    place.good2 = await makePlace(owner.id);
    const goneOwner = await person("Gone Owner");
    place.ownerless = await makePlace(goneOwner.id);
    await setStatus(goneOwner.id, 4);
    const bannedOwner = await person("Banned Owner");
    place.ownerBanned = await makePlace(bannedOwner.id);
    await setStatus(bannedOwner.id, 3);
    place.seeded = await makePlace(staff.id);
    place.seededClaimed = await makePlace(staff.id, { claimed: true });
    place.hidden = await makePlace(owner.id, { moderation_state: "hidden" });
    place.closed = await makePlace(owner.id, {
      temporary_status: "permanently_closed",
    });
    place.draft = await makePlace(owner.id, { status: "draft" });
    place.nigeria = await makePlace(owner.id, {
      country_code: "NG",
      timezone: "Africa/Lagos",
      location: "SRID=4326;POINT(3.3792 6.5244)",
    });
    // An event at the good place, tomorrow: its next-up line.
    {
      const id = await upcomingEvent(owner.id, 1);
      await service
        .from("event")
        .update({ place_id: place.good } as never)
        .eq("id", id);
    }

    const { data: kumasi } = await service
      .from("market_region")
      .select("id")
      .eq("country_code", "GH")
      .eq("slug", "kumasi")
      .single();
    kumasiId = (kumasi as { id: string }).id;

    await settings({
      enabled: false,
      audience: "staff",
      beta_user_ids: [],
      min_per_row: 1,
      max_per_row: 24,
    });
  });

  afterAll(async () => {
    await service
      .from("showcase_entry")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    await settings({
      enabled: false,
      audience: "staff",
      beta_user_ids: [],
      min_per_row: 4,
      max_per_row: 24,
    });
    await service.from("admin_user").delete().eq("user_id", staff.id);
    for (const id of eventIds) await deleteTestEvent(service, id);
    if (placeIds.length)
      await service.from("place").delete().in("id", placeIds);
    if (teamIds.length) {
      await service.from("team").delete().in("account_id", teamIds);
    }
    for (const u of users) {
      await service
        .from("follow")
        .delete()
        .or(`follower_id.eq.${u.id},target_id.eq.${u.id}`);
      await deleteTestUser(service, u.id);
    }
  });

  beforeEach(async () => {
    resetShowcaseSettingsCache();
  });

  it("gives clients no way in: tables and functions are service-role only", async () => {
    const user = viewer.client;
    for (const client of [anon, user]) {
      for (const table of [
        "showcase_program_setting",
        "showcase_entry",
        "showcase_daily_count",
      ] as const) {
        const read = await client.from(table).select("*").limit(1);
        expect(read.error?.code, `${table} read`).toBe("42501");
        const write = await client.from("showcase_entry").insert({
          subject_kind: "host",
          host_account_id: viewer.id,
          country_code: "GH",
          position: 999,
        } as never);
        expect(write.error, `${table} write`).not.toBeNull();
      }
      for (const [fn, args] of [
        ["showcase_wall", { p_lat: ACCRA.lat, p_lng: ACCRA.lng }],
        ["showcase_admin_entries", { p_country_code: "GH" }],
        ["showcase_subject_check", { p_country_code: "GH" }],
        [
          "showcase_entry_add",
          {
            p_subject_kind: "host",
            p_subject_id: viewer.id,
            p_country_code: "GH",
          },
        ],
        [
          "showcase_entry_move",
          { p_entry_id: crypto.randomUUID(), p_direction: "up" },
        ],
        ["showcase_count", { p_entry_id: crypto.randomUUID(), p_kind: "tap" }],
      ] as const) {
        const { error } = await client.rpc(fn as never, args as never);
        expect(error?.code, fn).toBeOneOf(["42501", "PGRST202"]);
      }
    }
  });

  it("works out on every read who shows and why the others do not", async () => {
    const hostCases: [string, ShowcaseHiddenReason | null][] = [
      ["good", null],
      ["good2", null],
      ["noEvent", "no_upcoming_event"],
      ["deleted", "account_deleted"],
      ["banned", "account_restricted"],
      ["suspended", "account_restricted"],
      ["postponed", "no_upcoming_event"],
      ["hidden", "no_upcoming_event"],
      ["restricted", "no_upcoming_event"],
      ["team", "team_paused"],
    ];
    const placeCases: [string, ShowcaseHiddenReason | null][] = [
      ["good", null],
      ["good2", null],
      ["ownerless", "ownerless"],
      ["ownerBanned", "owner_restricted"],
      ["seeded", "not_claimed"],
      ["seededClaimed", null],
      ["hidden", "moderated"],
      ["closed", "permanently_closed"],
      ["draft", "not_published"],
    ];
    // A deleted account cannot be added at all.
    const refused = await addShowcaseEntryCore(svc, ctx, {
      countryCode: "GH",
      subjectKind: "host",
      subjectId: host.deleted.id,
      regionId: null,
      note: null,
    });
    expect(refused.status).toBe(404);
    for (const [key] of hostCases) {
      if (key !== "deleted") await add("host", host[key].id);
    }
    // Deleted after being added: it drops out by itself.
    const lateGone = await person("Late Gone Host");
    await upcomingEvent(lateGone.id);
    await add("host", lateGone.id);
    await setStatus(lateGone.id, 4);

    for (const [key] of placeCases) await add("place", place[key]);
    // A place of another market cannot go on Ghana's wall.
    const otherMarket = await addShowcaseEntryCore(svc, ctx, {
      countryCode: "GH",
      subjectKind: "place",
      subjectId: place.nigeria,
      regionId: null,
      note: null,
    });
    expect(otherMarket.status).toBe(400);

    const entries = await adminEntries();
    for (const [key, reason] of hostCases) {
      if (key === "deleted") continue;
      expect(entries.get(host[key].id)?.reason ?? null, `host ${key}`).toBe(
        reason,
      );
    }
    expect(entries.get(lateGone.id)?.reason).toBe("account_deleted");
    for (const [key, reason] of placeCases) {
      expect(entries.get(place[key])?.reason ?? null, `place ${key}`).toBe(
        reason,
      );
    }
    // The good host's next event, by the Explore rule.
    expect(entries.get(host.good.id)?.nextEvent?.title).toBe(
      "Integration Test Event",
    );

    // The wall carries exactly the ones that show, in the staff order.
    await settings({ enabled: true, audience: "staff", min_per_row: 1 });
    const wall = await getShowcaseWallCore(svc, staff.id, ACCRA);
    expect(wall.status).toBe(200);
    expect(wall.data?.countryCode).toBe("GH");
    expect(wall.data?.regionName).toBe("Accra");
    expect(wall.data?.hosts.map((h) => h.subjectId)).toEqual([
      host.good.id,
      host.good2.id,
    ]);
    expect(wall.data?.places.map((p) => p.subjectId)).toEqual([
      place.good,
      place.good2,
      place.seededClaimed,
    ]);
    const good = wall.data?.places[0];
    expect(good?.nextEvent?.timezone).toBe("Africa/Accra");
    expect(good?.area).toBe("Osu");
    expect(good?.openNow).toBeNull();
    expect(wall.data?.places[1]?.categorySlug).toBe("restaurant");

    // An event that ends drops a host out on the next read.
    const { data: goodEvents } = await service
      .from("event")
      .select("id")
      .eq("organizer_id", host.good2.id);
    await service
      .from("event")
      .update({
        starts_at: new Date(Date.now() - 3 * DAY).toISOString(),
        ends_at: new Date(Date.now() - 2 * DAY).toISOString(),
      } as never)
      .in(
        "id",
        (goodEvents ?? []).map((e) => e.id),
      );
    const after = await getShowcaseWallCore(svc, staff.id, ACCRA);
    expect(after.data?.hosts.map((h) => h.subjectId)).toEqual([host.good.id]);
    expect((await adminEntries()).get(host.good2.id)?.reason).toBe(
      "no_upcoming_event",
    );
  });

  it("keeps a market that is not live off its wall", async () => {
    await add("place", place.nigeria, "NG");
    const entries = await adminEntries("NG");
    expect(entries.get(place.nigeria)?.reason).toBe("market_closed");
    await settings({ enabled: true, audience: "staff", min_per_row: 1 });
    const wall = await getShowcaseWallCore(svc, staff.id, {
      countryCode: "NG",
    });
    expect(wall.status).toBe(200);
    expect(wall.data).toBeNull();
  });

  it("follows the switch and the audience, failing closed", async () => {
    await settings({ enabled: false, audience: "all", min_per_row: 1 });
    expect((await getShowcaseWallCore(svc, staff.id, ACCRA)).data).toBeNull();
    expect((await getShowcaseWallCore(svc, null, ACCRA)).data).toBeNull();
    expect((await getShowcaseDirectoryCore(svc, staff.id, ACCRA)).status).toBe(
      404,
    );

    await settings({ enabled: true, audience: "staff" });
    expect(
      (await getShowcaseWallCore(svc, staff.id, ACCRA)).data?.hosts.length,
    ).toBeGreaterThan(0);
    expect((await getShowcaseWallCore(svc, viewer.id, ACCRA)).data).toBeNull();
    expect((await getShowcaseWallCore(svc, null, ACCRA)).data).toBeNull();
    const staffDirectory = await getShowcaseDirectoryCore(svc, staff.id, ACCRA);
    expect(staffDirectory.status).toBe(200);
    expect(staffDirectory.data?.isPublic).toBe(false);

    await settings({ audience: "beta", beta_user_ids: [beta.id] });
    expect(
      (await getShowcaseWallCore(svc, beta.id, ACCRA)).data,
    ).not.toBeNull();
    expect((await getShowcaseWallCore(svc, viewer.id, ACCRA)).data).toBeNull();
    expect((await getShowcaseWallCore(svc, null, ACCRA)).data).toBeNull();

    await settings({ audience: "all" });
    const open = await getShowcaseWallCore(svc, null, ACCRA);
    expect(open.data?.hosts.length).toBeGreaterThan(0);
    expect(open.data?.hosts.every((h) => h.following === false)).toBe(true);
    expect(
      (await getShowcaseDirectoryCore(svc, null, ACCRA)).data?.isPublic,
    ).toBe(true);

    process.env.SHOWCASE_KILL_SWITCH = "true";
    try {
      expect((await getShowcaseWallCore(svc, null, ACCRA)).data).toBeNull();
    } finally {
      process.env.SHOWCASE_KILL_SWITCH = undefined;
      // biome-ignore lint/performance/noDelete: an unset env var, not "undefined"
      delete process.env.SHOWCASE_KILL_SWITCH;
    }
    await settings({ audience: "staff", beta_user_ids: [] });
  });

  it("hides a row below the minimum, and the section when no row reaches it", async () => {
    // Showing now: one host, three places (good, good2, seededClaimed).
    await settings({ enabled: true, audience: "staff", min_per_row: 3 });
    let wall = await getShowcaseWallCore(svc, staff.id, ACCRA);
    expect(wall.data?.hosts).toEqual([]);
    expect(wall.data?.places).toHaveLength(3);

    await settings({ min_per_row: 4 });
    wall = await getShowcaseWallCore(svc, staff.id, ACCRA);
    expect(wall.status).toBe(200);
    expect(wall.data).toBeNull();
    const directory = await getShowcaseDirectoryCore(svc, staff.id, ACCRA);
    expect(directory.status).toBe(200);
    expect(directory.data?.wall).toBeNull();

    // max_per_row caps the moving row; the directory lists everyone.
    await settings({ min_per_row: 1, max_per_row: 4 });
    const extra: string[] = [];
    const owner = await person("Extra Owner");
    for (let i = 0; i < 3; i += 1) {
      extra.push(await makePlace(owner.id));
      await add("place", extra[i]);
    }
    wall = await getShowcaseWallCore(svc, staff.id, ACCRA);
    expect(wall.data?.places).toHaveLength(4);
    const all = await getShowcaseDirectoryCore(svc, staff.id, ACCRA);
    expect(all.data?.wall?.places).toHaveLength(6);
    await settings({ max_per_row: 24 });
  });

  it("limits a city entry to people browsing that city", async () => {
    await settings({ enabled: true, audience: "staff", min_per_row: 1 });
    const kumasiHost = await person("Kumasi Host");
    await upcomingEvent(kumasiHost.id);
    await add("host", kumasiHost.id, "GH", kumasiId);
    const inAccra = await getShowcaseWallCore(svc, staff.id, ACCRA);
    expect(inAccra.data?.hosts.map((h) => h.subjectId)).not.toContain(
      kumasiHost.id,
    );
    const inKumasi = await getShowcaseWallCore(svc, staff.id, KUMASI);
    expect(inKumasi.data?.regionName).toBe("Kumasi");
    expect(inKumasi.data?.hosts.map((h) => h.subjectId)).toContain(
      kumasiHost.id,
    );
    // The default market without a point: whole-market entries only.
    const nowhere = await getShowcaseWallCore(svc, staff.id, {});
    expect(nowhere.data?.countryCode).toBe("GH");
    expect(nowhere.data?.hosts.map((h) => h.subjectId)).not.toContain(
      kumasiHost.id,
    );
  });

  it("orders, moves and removes entries, auditing each change", async () => {
    const before = await getShowcaseAdminViewCore(svc, ctx, {
      countryCode: "GH",
    });
    const list = before.data?.entries ?? [];
    expect(list.length).toBeGreaterThan(2);
    const [first, second] = list;

    const up = await moveShowcaseEntryCore(svc, ctx, {
      entryId: second.id,
      direction: "up",
    });
    expect(up.data?.moved).toBe(true);
    const top = await moveShowcaseEntryCore(svc, ctx, {
      entryId: second.id,
      direction: "up",
    });
    expect(top.data?.moved).toBe(false);
    const moved = await getShowcaseAdminViewCore(svc, ctx, {
      countryCode: "GH",
    });
    expect(moved.data?.entries[0]?.id).toBe(second.id);
    expect(moved.data?.entries[1]?.id).toBe(first.id);

    // Already on the wall.
    const twice = await addShowcaseEntryCore(svc, ctx, {
      countryCode: "GH",
      subjectKind: first.subjectKind,
      subjectId: first.subjectId,
      regionId: null,
      note: null,
    });
    expect(twice.status).toBe(409);

    // Without showcase.edit nothing changes.
    const viewOnly = { ...ctx, permissions: ["showcase.view" as const] };
    expect(
      (await removeShowcaseEntryCore(svc, viewOnly, { entryId: first.id }))
        .status,
    ).toBe(403);
    expect(
      (
        await searchShowcaseCandidatesCore(svc, viewOnly, {
          countryCode: "GH",
          q: "Good Host",
          kind: "any",
        })
      ).status,
    ).toBe(403);
    expect(
      (await getShowcaseAdminViewCore(svc, { ...ctx, permissions: [] }, {}))
        .status,
    ).toBe(403);

    const last = list[list.length - 1];
    const removed = await removeShowcaseEntryCore(svc, ctx, {
      entryId: last.id,
    });
    expect(removed.status).toBe(200);
    expect((await adminEntries()).has(last.subjectId)).toBe(false);

    const { data: audit } = await service
      .from("admin_audit_log")
      .select("action, target_id")
      .eq("actor_id", staff.id)
      .like("action", "showcase.%");
    const actions = (audit ?? []).map((a) => a.action);
    expect(actions).toContain("showcase.entry.add");
    expect(actions).toContain("showcase.entry.move");
    expect(actions).toContain("showcase.entry.remove");
  });

  it("finds hosts by @handle and says whether they would show", async () => {
    const { data: u } = await service
      .from("user_info")
      .select("username")
      .eq("id", host.noEvent.id)
      .single();
    const res = await searchShowcaseCandidatesCore(svc, ctx, {
      countryCode: "GH",
      q: `@${(u as { username: string }).username}`,
      kind: "any",
    });
    expect(res.status).toBe(200);
    const found = res.data?.find((c) => c.subjectId === host.noEvent.id);
    expect(found?.reason).toBe("no_upcoming_event");
    expect(found?.entryId).not.toBeNull();
  });

  it("changes settings with a reason and the row's version, audited", async () => {
    const { data: row } = await service
      .from("showcase_program_setting")
      .select("updated_at")
      .eq("id", 1)
      .single();
    const stale = await updateShowcaseSettingsCore(svc, ctx, {
      expectedUpdatedAt: "2000-01-01T00:00:00Z",
      reason: "Testing a stale write",
      patch: { minPerRow: 2 },
    });
    expect(stale.status).toBe(409);
    const bad = await updateShowcaseSettingsCore(svc, ctx, {
      expectedUpdatedAt: (row as { updated_at: string }).updated_at,
      reason: "Testing the bounds",
      patch: { minPerRow: 30, maxPerRow: 10 },
    });
    expect(bad.status).toBe(400);
    const ok = await updateShowcaseSettingsCore(svc, ctx, {
      expectedUpdatedAt: (row as { updated_at: string }).updated_at,
      reason: "Testing the settings",
      patch: { minPerRow: 2 },
    });
    expect(ok.status, ok.message).toBe(200);
    expect(ok.data?.minPerRow).toBe(2);
    const { data: audit } = await service
      .from("admin_audit_log")
      .select("action, reason")
      .eq("actor_id", staff.id)
      .eq("action", "showcase.settings.update");
    expect(audit?.[0]?.reason).toBe("Testing the settings");
  });

  it("counts taps once an hour per viewer, and new follows from a tile once a day", async () => {
    await settings({ enabled: true, audience: "staff", min_per_row: 1 });
    const entries = await adminEntries();
    const hostEntry = entries.get(host.good.id) as ShowcaseAdminEntry;
    const placeEntry = entries.get(place.good) as ShowcaseAdminEntry;

    // Off for the viewer: nothing is counted.
    const notOn = await recordShowcaseTapCore(svc, viewer.id, {
      entryId: hostEntry.id,
    });
    expect(notOn.data?.counted).toBe(false);

    const tap = await recordShowcaseTapCore(svc, staff.id, {
      entryId: hostEntry.id,
    });
    expect(tap.data?.counted).toBe(true);
    const again = await recordShowcaseTapCore(svc, staff.id, {
      entryId: hostEntry.id,
    });
    expect(again.data?.counted).toBe(false);

    // A follow from the tile counts; unfollowing and following again the
    // same day does not count twice; a follow that names another entry's
    // subject is not counted against this one.
    const follower = staff.id;
    const followed = await setFollowCore(svc, follower, {
      targetKind: "organizer",
      targetId: host.good.id,
      following: true,
      showcaseEntryId: hostEntry.id,
    });
    expect(followed.status, followed.message).toBe(200);
    await setFollowCore(svc, follower, {
      targetKind: "organizer",
      targetId: host.good.id,
      following: false,
      showcaseEntryId: hostEntry.id,
    });
    await setFollowCore(svc, follower, {
      targetKind: "organizer",
      targetId: host.good.id,
      following: true,
      showcaseEntryId: hostEntry.id,
    });
    await setFollowCore(svc, follower, {
      targetKind: "organizer",
      targetId: host.good.id,
      following: true,
      showcaseEntryId: placeEntry.id,
    });

    const counted = await adminEntries();
    expect(counted.get(host.good.id)?.counts.taps7).toBe(1);
    expect(counted.get(host.good.id)?.counts.follows7).toBe(1);
    expect(counted.get(place.good)?.counts.follows7).toBe(0);

    // The wall now says the viewer follows them.
    const wall = await getShowcaseWallCore(svc, follower, ACCRA);
    expect(
      wall.data?.hosts.find((h) => h.subjectId === host.good.id)?.following,
    ).toBe(true);
  });
});
