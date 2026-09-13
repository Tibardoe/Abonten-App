import { addDays, weekStartFor } from "@abonten/core/weekly/week";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getWeeklyEditionCore,
  getWeeklyTeaserCore,
} from "../weekly/weeklyEditionCore";
import {
  createWeeklyPreviewToken,
  getWeeklyPreviewCore,
} from "../weekly/weeklyPreview";
import {
  resetWeeklySettingsCache,
  resolveWeeklyAccess,
} from "../weekly/weeklyProgram";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

/** Test helper: the value must be present (fails the test clearly if not). */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected a value");
  }
  return value;
}

// Abonten Weekly public reads against a real local stack (migration
// 20260913120000_weekly_core.sql): the access boundary on the new tables and
// functions, the programme switch and audiences, what the public document
// may contain, scope resolution and fallbacks, and the rule that a listing
// that stops being valid disappears from a published edition on the next read.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["weekly_program_setting"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;
const anon = createClient<Database>(
  process.env.SUPABASE_TEST_URL as string,
  process.env.SUPABASE_TEST_ANON_KEY as string,
  { auth: { persistSession: false } },
);

const TOKEN = crypto.randomUUID().slice(0, 6);
const THIS_MONDAY = weekStartFor(new Date());
const LAST_MONDAY = addDays(THIS_MONDAY, -7);
// A point far from Accra, so this scope never contains anyone else's data.
const LAT = 9.4034;
const LNG = -0.8424;

let organizer: TestUser;
let staffUser: TestUser;
let betaUser: TestUser;
let stranger: TestUser;
let original: SettingsRow;
let scopeId: string;
const scopeSlug = `it-tamale-${TOKEN}`;
const editionIds: string[] = [];
const eventIds: string[] = [];
const placeIds: string[] = [];

async function setSettings(patch: Partial<SettingsRow>) {
  const { error } = await svc
    .from("weekly_program_setting")
    .update(patch as never)
    .eq("id", 1);
  expect(error).toBeNull();
  resetWeeklySettingsCache();
}

async function makeEvent(title: string) {
  const { eventId } = await createTestEventWithTicketType(
    svc as never,
    organizer.id,
    { quantity: 50 },
  );
  await svc
    .from("event")
    .update({ title, status: "published" } as never)
    .eq("id", eventId);
  await svc
    .from("event")
    .update({ location: `SRID=4326;POINT(${LNG} ${LAT})` } as never)
    .eq("id", eventId);
  eventIds.push(eventId);
  return eventId;
}

async function makePlace(name: string) {
  const { data, error } = await svc
    .from("place")
    .insert({
      owner_id: organizer.id,
      name,
      slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
      description: "A weekly integration test place.",
      category_id: 1,
      location: `SRID=4326;POINT(${LNG} ${LAT})`,
      address: { full_address: "Tamale" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status: "published",
    } as never)
    .select("id")
    .single();
  expect(error).toBeNull();
  placeIds.push(must(data).id);
  return must(data).id as string;
}

/** Build a published edition directly (the lifecycle has its own tests). */
async function publishedEdition(
  targetScopeId: string,
  weekStart: string,
  items: { type: "event" | "place"; id: string }[],
  extra: { hiddenSection?: boolean } = {},
) {
  const { data: editionId, error } = await svc.rpc("weekly_edition_create", {
    p_actor: organizer.id,
    p_scope_id: targetScopeId,
    p_week_start: weekStart,
    p_title: `Weekly ${TOKEN} ${weekStart}`,
  } as never);
  expect(error).toBeNull();
  editionIds.push(editionId as string);

  const { data: section } = await svc
    .from("weekly_section")
    .insert({
      edition_id: editionId,
      position: 0,
      kind: "curated",
      title: "Picks",
    } as never)
    .select("id")
    .single();
  await svc.from("weekly_item").insert(
    items.map((item, position) => ({
      section_id: must(section).id,
      edition_id: editionId,
      position,
      subject_type: item.type,
      subject_id: item.id,
      source: "manual",
      pinned: true,
      score: 0.9,
      added_by: organizer.id,
    })) as never,
  );
  if (extra.hiddenSection) {
    const { data: hidden } = await svc
      .from("weekly_section")
      .insert({
        edition_id: editionId,
        position: 1,
        kind: "curated",
        title: "Hidden section",
        is_visible: false,
      } as never)
      .select("id")
      .single();
    await svc.from("weekly_item").insert({
      section_id: must(hidden).id,
      edition_id: editionId,
      position: 0,
      subject_type: items[0].type,
      subject_id: items[0].id,
    } as never);
  }
  await svc
    .from("weekly_edition")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    } as never)
    .eq("id", editionId as string);
  return editionId as string;
}

beforeAll(async () => {
  const service = getServiceClient();
  [organizer, staffUser, betaUser, stranger] = await Promise.all([
    createTestUser(service),
    createTestUser(service),
    createTestUser(service),
    createTestUser(service),
  ]);
  await svc
    .from("admin_user")
    .insert({ user_id: staffUser.id, status: "active" } as never);

  const { data: settings } = await svc
    .from("weekly_program_setting")
    .select("*")
    .eq("id", 1)
    .single();
  original = settings as SettingsRow;

  const { data: scope, error } = await svc
    .from("weekly_scope")
    .insert({
      slug: scopeSlug,
      name: `Tamale ${TOKEN}`,
      centre: `SRID=4326;POINT(${LNG} ${LAT})`,
      radius_km: 20,
    } as never)
    .select("id")
    .single();
  expect(error).toBeNull();
  scopeId = must(scope).id;
});

afterAll(async () => {
  if (editionIds.length)
    await svc.from("weekly_edition").delete().in("id", editionIds);
  if (scopeId) await svc.from("weekly_scope").delete().eq("id", scopeId);
  if (placeIds.length) await svc.from("place").delete().in("id", placeIds);
  if (eventIds.length) await svc.from("event").delete().in("id", eventIds);
  if (original) {
    const { id: _id, ...rest } = original;
    await svc
      .from("weekly_program_setting")
      .update(rest as never)
      .eq("id", 1);
  }
  resetWeeklySettingsCache();
  const service = getServiceClient();
  if (staffUser)
    await svc.from("admin_user").delete().eq("user_id", staffUser.id);
  for (const u of [organizer, staffUser, betaUser, stranger]) {
    if (u) await deleteTestUser(service, u.id);
  }
});

describe("access boundary", () => {
  it("gives clients no access to any weekly table", async () => {
    for (const table of [
      "weekly_program_setting",
      "weekly_scope",
      "weekly_edition",
      "weekly_section",
      "weekly_item",
    ] as const) {
      for (const client of [anon, stranger.client]) {
        const read = await client.from(table).select("*").limit(1);
        expect(read.error?.code, `${table} select`).toBe("42501");
        const write = await client.from(table).insert({} as never);
        expect(write.error?.code, `${table} insert`).toBe("42501");
      }
    }
  });

  it("lets clients execute none of the weekly functions", async () => {
    const calls = [
      ["weekly_edition_view", { p_scope_slug: "ghana" }],
      ["weekly_edition_document", { p_edition_id: crypto.randomUUID() }],
      ["weekly_resolve_scope", { p_lat: LAT, p_lng: LNG }],
      [
        "weekly_subject_validity",
        { p_subject_type: "event", p_subject_id: crypto.randomUUID() },
      ],
      [
        "weekly_claim_edit",
        { p_edition_id: crypto.randomUUID(), p_expected_version: 1 },
      ],
      ["weekly_publish_due", {}],
    ] as const;
    for (const [fn, args] of calls) {
      for (const client of [anon, stranger.client]) {
        const { error } = await client.rpc(fn as never, args as never);
        expect(error?.code, fn).toBe("42501");
      }
    }
  });
});

describe("programme switch and audience", () => {
  let eventId: string;

  beforeAll(async () => {
    eventId = await makeEvent(`Audience ${TOKEN}`);
    await publishedEdition(scopeId, THIS_MONDAY, [
      { type: "event", id: eventId },
    ]);
  });

  it("shows nothing to anyone while the programme is off", async () => {
    await setSettings({ enabled: false, audience: "all" });
    for (const userId of [null, staffUser.id]) {
      const res = await getWeeklyEditionCore(svc, userId, { scope: scopeSlug });
      expect(res.status).toBe(200);
      expect(res.data?.available).toBe(false);
      expect(res.data?.edition).toBeNull();
      expect(res.data?.visibility).toBe("public");
    }
  });

  it("opens to staff only, and marks the answer as personal", async () => {
    await setSettings({
      enabled: true,
      audience: "staff",
      beta_user_ids: [betaUser.id],
    });
    const anonymous = await getWeeklyEditionCore(svc, null, {
      scope: scopeSlug,
    });
    expect(anonymous.data?.available).toBe(false);
    expect(anonymous.data?.visibility).toBe("personal");
    expect(
      (await getWeeklyEditionCore(svc, stranger.id, { scope: scopeSlug })).data
        ?.available,
    ).toBe(false);
    expect(
      (await getWeeklyEditionCore(svc, betaUser.id, { scope: scopeSlug })).data
        ?.available,
    ).toBe(false);
    const staff = await getWeeklyEditionCore(svc, staffUser.id, {
      scope: scopeSlug,
    });
    expect(staff.data?.available).toBe(true);
    expect(staff.data?.edition?.edition.scopeSlug).toBe(scopeSlug);
  });

  it("adds beta testers for the beta audience", async () => {
    await setSettings({
      enabled: true,
      audience: "beta",
      beta_user_ids: [betaUser.id],
    });
    expect(
      (await getWeeklyEditionCore(svc, betaUser.id, { scope: scopeSlug })).data
        ?.available,
    ).toBe(true);
    expect(
      (await getWeeklyEditionCore(svc, staffUser.id, { scope: scopeSlug })).data
        ?.available,
    ).toBe(true);
    expect(
      (await getWeeklyEditionCore(svc, stranger.id, { scope: scopeSlug })).data
        ?.available,
    ).toBe(false);
  });

  it("opens to signed-out visitors for everyone, as a public answer", async () => {
    await setSettings({ enabled: true, audience: "all", teaser_enabled: true });
    const res = await getWeeklyEditionCore(svc, null, { scope: scopeSlug });
    expect(res.data?.available).toBe(true);
    expect(res.data?.visibility).toBe("public");
  });

  it("is stopped by the kill switch whatever the settings say", async () => {
    process.env.WEEKLY_KILL_SWITCH = "true";
    try {
      const access = await resolveWeeklyAccess(svc, staffUser.id);
      expect(access.program.enabled).toBe(false);
      expect(
        (await getWeeklyEditionCore(svc, null, { scope: scopeSlug })).data
          ?.available,
      ).toBe(false);
    } finally {
      Reflect.deleteProperty(process.env, "WEEKLY_KILL_SWITCH");
    }
  });
});

describe("the public document", () => {
  let validEvent: string;
  let place: string;

  beforeAll(async () => {
    await setSettings({ enabled: true, audience: "all", teaser_enabled: true });
    validEvent = await makeEvent(`Document ${TOKEN}`);
    place = await makePlace(`Weekly place ${TOKEN}`);
  });

  beforeEach(async () => {
    // Each test builds its own current-week edition in the test scope.
    const { data } = await svc
      .from("weekly_edition")
      .select("id")
      .eq("scope_id", scopeId)
      .eq("week_start", THIS_MONDAY);
    for (const row of data ?? []) {
      await svc.from("weekly_edition").delete().eq("id", row.id);
    }
  });

  it("carries card-ready rows and never internal fields", async () => {
    await publishedEdition(
      scopeId,
      THIS_MONDAY,
      [
        { type: "event", id: validEvent },
        { type: "place", id: place },
      ],
      { hiddenSection: true },
    );
    const { data, error } = await svc.rpc("weekly_edition_view", {
      p_scope_slug: scopeSlug,
    } as never);
    expect(error).toBeNull();
    // biome-ignore lint/suspicious/noExplicitAny: inspecting a raw jsonb document shape in a test.
    const doc = data as Record<string, any>;

    expect(doc.sections).toHaveLength(1);
    const [eventItem, placeItem] = doc.sections[0].items;
    expect(Object.keys(eventItem).sort()).toEqual(
      [
        "blurb",
        "event",
        "headline",
        "id",
        "place",
        "position",
        "subjectId",
        "subjectType",
      ].sort(),
    );
    expect(eventItem.event.event_code).toBeTruthy();
    expect(eventItem.event.flyer_public_id).toBe("test/flyer");
    expect(placeItem.place.slug).toContain("weekly-place");

    const serialised = JSON.stringify(doc);
    for (const internal of [
      '"score"',
      '"source"',
      '"pinned"',
      '"validity"',
      '"isVisible"',
      '"version"',
      '"status":"draft"',
      "Hidden section",
    ]) {
      expect(serialised).not.toContain(internal);
    }
    expect(Object.keys(doc.edition)).not.toContain("scheduledFor");
  });

  it("drops a listing the moment it is cancelled, hidden or closed, and the edition when nothing is left", async () => {
    const cancelled = await makeEvent(`Cancel me ${TOKEN}`);
    const closing = await makePlace(`Closing ${TOKEN}`);
    await publishedEdition(scopeId, THIS_MONDAY, [
      { type: "event", id: cancelled },
      { type: "place", id: closing },
    ]);

    const itemsNow = async () =>
      (
        await getWeeklyEditionCore(svc, null, { scope: scopeSlug })
      ).data?.edition?.sections.flatMap((s) => s.items) ?? [];

    expect(await itemsNow()).toHaveLength(2);

    await svc
      .from("event")
      .update({ status: "canceled" } as never)
      .eq("id", cancelled);
    expect((await itemsNow()).map((i) => i.subjectType)).toEqual(["place"]);

    await svc
      .from("place")
      .update({ temporary_status: "permanently_closed" } as never)
      .eq("id", closing);
    const empty = await getWeeklyEditionCore(svc, null, { scope: scopeSlug });
    expect(empty.data?.edition).toBeNull();
    expect(empty.status).toBe(200);
  });

  it("drops hidden, restricted and archived listings too", async () => {
    const hidden = await makeEvent(`Hidden ${TOKEN}`);
    const restricted = await makeEvent(`Restricted ${TOKEN}`);
    const archived = await makeEvent(`Archived ${TOKEN}`);
    await svc
      .from("event")
      .update({ moderation_state: "hidden" } as never)
      .eq("id", hidden);
    await svc
      .from("event")
      .update({ moderation_state: "restricted" } as never)
      .eq("id", restricted);
    await svc
      .from("event")
      .update({ archived_at: new Date().toISOString() } as never)
      .eq("id", archived);

    for (const [id, reason] of [
      [hidden, "hidden"],
      [restricted, "restricted"],
      [archived, "archived"],
    ] as const) {
      const { data } = await svc.rpc("weekly_subject_validity", {
        p_subject_type: "event",
        p_subject_id: id,
      } as never);
      expect(data).toBe(reason);
    }
    expect(
      (
        await svc.rpc("weekly_subject_validity", {
          p_subject_type: "event",
          p_subject_id: crypto.randomUUID(),
        } as never)
      ).data,
    ).toBe("missing");
  });

  it("keeps ended events in a past week's edition but not in the current one", async () => {
    const ended = await makeEvent(`Ended ${TOKEN}`);
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const pastEnd = new Date(
      Date.now() - 3 * 86_400_000 + 3_600_000,
    ).toISOString();
    await svc
      .from("event")
      .update({ starts_at: past, ends_at: pastEnd } as never)
      .eq("id", ended);
    await svc.from("event_occurrence").delete().eq("event_id", ended);

    expect(
      (
        await svc.rpc("weekly_subject_validity", {
          p_subject_type: "event",
          p_subject_id: ended,
        } as never)
      ).data,
    ).toBe("ended");

    const twoWeeksAgo = addDays(THIS_MONDAY, -14);
    await publishedEdition(scopeId, twoWeeksAgo, [
      { type: "event", id: ended },
    ]);
    const history = await getWeeklyEditionCore(svc, null, {
      scope: scopeSlug,
      week: twoWeeksAgo,
    });
    expect(history.status).toBe(200);
    expect(history.data?.edition?.edition.weekIsOver).toBe(true);
    expect(history.data?.edition?.isCurrent).toBe(false);
    expect(history.data?.edition?.sections[0].items).toHaveLength(1);

    await publishedEdition(scopeId, THIS_MONDAY, [
      { type: "event", id: ended },
    ]);
    const current = await getWeeklyEditionCore(svc, null, {
      scope: scopeSlug,
      week: THIS_MONDAY,
    });
    expect(current.status).toBe(404);
  });
});

describe("scopes and fallbacks", () => {
  let eventId: string;

  beforeAll(async () => {
    await setSettings({ enabled: true, audience: "all", teaser_enabled: true });
    eventId = await makeEvent(`Fallback ${TOKEN}`);
    // Clear anything this suite left in the test scope.
    const { data } = await svc
      .from("weekly_edition")
      .select("id")
      .eq("scope_id", scopeId);
    for (const row of data ?? [])
      await svc.from("weekly_edition").delete().eq("id", row.id);
  });

  it("resolves a point inside the scope to it, and anywhere else to Ghana", async () => {
    const inside = await svc.rpc("weekly_resolve_scope", {
      p_lat: LAT + 0.05,
      p_lng: LNG,
    } as never);
    expect((inside.data as { slug: string }[])[0].slug).toBe(scopeSlug);
    const outside = await svc.rpc("weekly_resolve_scope", {
      p_lat: 4.9,
      p_lng: -1.76,
    } as never);
    expect((outside.data as { slug: string }[])[0].slug).toBe("ghana");
  });

  it("returns 404 for an unknown area and for an edition that is not published", async () => {
    expect(
      (await getWeeklyEditionCore(svc, null, { scope: `nowhere-${TOKEN}` }))
        .status,
    ).toBe(404);
    expect(
      (
        await getWeeklyEditionCore(svc, null, {
          scope: scopeSlug,
          week: addDays(THIS_MONDAY, -70),
        })
      ).status,
    ).toBe(404);
  });

  it("offers this week's upcoming events when no edition is out", async () => {
    const res = await getWeeklyEditionCore(svc, null, { lat: LAT, lng: LNG });
    expect(res.status).toBe(200);
    expect(res.data?.available).toBe(true);
    expect(res.data?.edition).toBeNull();
    expect(Array.isArray(res.data?.fallbackEvents)).toBe(true);
  });

  it("shows last week's edition, flagged, until this week's is out", async () => {
    await publishedEdition(scopeId, LAST_MONDAY, [
      { type: "event", id: eventId },
    ]);
    const res = await getWeeklyEditionCore(svc, null, { scope: scopeSlug });
    // A Ghana-wide edition for this week (if a developer published one on
    // this local stack) legitimately wins over last week's regional one.
    if (res.data?.edition?.isFallbackScope) {
      expect(res.data.edition.edition.scopeSlug).toBe("ghana");
    } else {
      expect(res.data?.edition?.isPreviousWeek).toBe(true);
      expect(res.data?.edition?.edition.weekStart).toBe(LAST_MONDAY);
      // The teaser only ever means this week.
      const teaser = await getWeeklyTeaserCore(svc, null, {
        lat: LAT,
        lng: LNG,
      });
      expect(teaser.data).toBeNull();
    }
  });

  it("prefers this week's edition and builds a teaser from it", async () => {
    await publishedEdition(scopeId, THIS_MONDAY, [
      { type: "event", id: eventId },
    ]);
    const res = await getWeeklyEditionCore(svc, null, { lat: LAT, lng: LNG });
    expect(res.data?.edition?.edition.weekStart).toBe(THIS_MONDAY);
    expect(res.data?.edition?.isFallbackScope).toBe(false);
    expect(res.data?.edition?.isPreviousWeek).toBe(false);

    const teaser = await getWeeklyTeaserCore(svc, null, { lat: LAT, lng: LNG });
    expect(teaser.data?.scopeSlug).toBe(scopeSlug);
    expect(teaser.data?.href).toBe(`/weekly/${scopeSlug}/${THIS_MONDAY}`);
    expect(teaser.data?.images[0]?.publicId).toBe("test/flyer");

    await setSettings({ teaser_enabled: false });
    expect(
      (await getWeeklyTeaserCore(svc, null, { lat: LAT, lng: LNG })).data,
    ).toBeNull();
    await setSettings({ teaser_enabled: true });
  });

  it("previews a draft only with a valid, unexpired link", async () => {
    const { data: draftId } = await svc.rpc("weekly_edition_create", {
      p_actor: organizer.id,
      p_scope_id: scopeId,
      p_week_start: addDays(THIS_MONDAY, 7),
      p_title: `Draft ${TOKEN}`,
    } as never);
    editionIds.push(draftId as string);
    const { data: section } = await svc
      .from("weekly_section")
      .insert({
        edition_id: draftId,
        position: 0,
        kind: "curated",
        title: "Soon",
      } as never)
      .select("id")
      .single();
    await svc.from("weekly_item").insert({
      section_id: must(section).id,
      edition_id: draftId,
      position: 0,
      subject_type: "event",
      subject_id: eventId,
    } as never);

    // Not public.
    expect(
      (
        await getWeeklyEditionCore(svc, null, {
          scope: scopeSlug,
          week: addDays(THIS_MONDAY, 7),
        })
      ).status,
    ).toBe(404);

    const token = createWeeklyPreviewToken(draftId as string);
    const preview = await getWeeklyPreviewCore(svc, token);
    expect(preview.status).toBe(200);
    expect(preview.data?.status).toBe("draft");
    expect(preview.data?.edition.sections[0].items).toHaveLength(1);

    const expired = createWeeklyPreviewToken(
      draftId as string,
      Date.now() - 31 * 60_000,
    );
    expect((await getWeeklyPreviewCore(svc, expired)).status).toBe(403);
    expect((await getWeeklyPreviewCore(svc, `${token}x`)).status).toBe(403);
  });
});
