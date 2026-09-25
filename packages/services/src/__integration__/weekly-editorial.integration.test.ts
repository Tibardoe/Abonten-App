import { addDays, weekStartFor } from "@abonten/core/weekly/week";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addWeeklyItemCore,
  addWeeklySectionCore,
  createWeeklyEditionCore,
  deleteWeeklySectionCore,
  getWeeklyEditionAdminCore,
  getWeeklyPreviewLinkCore,
  listWeeklyEditionsCore,
  removeWeeklyItemCore,
  reorderWeeklyItemsCore,
  reorderWeeklySectionsCore,
  searchWeeklySubjectsCore,
  transitionWeeklyEditionCore,
  updateWeeklyEditionCore,
  updateWeeklyItemCore,
  updateWeeklySectionCore,
} from "../admin/weekly/weeklyAdminCore";
import {
  getWeeklySettingsCore,
  listWeeklyScopesCore,
  updateWeeklySettingsCore,
  upsertWeeklyScopeCore,
} from "../admin/weekly/weeklySettingsAdminCore";
import { resetWeeklySettingsCache } from "../weekly/weeklyProgram";
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

// Abonten Weekly editorial workflow against a real local stack: permission
// checks in every admin core, optimistic versions, listing rules, the state
// machine (including the scheduler job), audit entries, settings and areas.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

type SettingsRow =
  Database["public"]["Tables"]["weekly_program_setting"]["Row"];

const svc = getServiceClient() as unknown as ServiceRoleClient;
const TOKEN = crypto.randomUUID().slice(0, 6);
const THIS_MONDAY = weekStartFor(new Date());
// Far-future weeks so nothing here collides with real or other test editions.
const WEEK_A = addDays(THIS_MONDAY, 7 * 40);
const WEEK_B = addDays(THIS_MONDAY, 7 * 41);
const WEEK_C = addDays(THIS_MONDAY, 7 * 42);

let admin: TestUser;
let organizer: TestUser;
let original: SettingsRow;
let scopeId: string;
const editionIds: string[] = [];
const eventIds: string[] = [];
const placeIds: string[] = [];
const scopeIds: string[] = [];

function ctx(permissions: string[]): AdminContext {
  return {
    userId: admin.id,
    email: null,
    roles: ["operations"],
    permissions: permissions as AdminContext["permissions"],
    reauthenticatedAt: Date.now(),
  };
}

const EDITOR = ctx.bind(null, ["weekly.view", "weekly.edit"]);
const PUBLISHER = ctx.bind(null, [
  "weekly.view",
  "weekly.edit",
  "weekly.publish",
]);
const CONFIGURER = ctx.bind(null, ["weekly.view", "weekly.configure"]);
const VIEWER = ctx.bind(null, ["weekly.view"]);

async function makeEvent(title: string) {
  const { eventId } = await createTestEventWithTicketType(
    svc as never,
    organizer.id,
    {
      quantity: 20,
    },
  );
  await svc
    .from("event")
    .update({ title, status: "published" } as never)
    .eq("id", eventId);
  eventIds.push(eventId);
  return eventId;
}

async function makePlace(name: string) {
  const { data } = await svc
    .from("place")
    .insert({
      country_code: "GH",
      timezone: "Africa/Accra",
      owner_id: organizer.id,
      name,
      slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${crypto.randomUUID()}`,
      description: "Weekly editorial test place.",
      category_id: 1,
      location: "SRID=4326;POINT(-0.187 5.6037)",
      address: { full_address: "Accra" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status: "published",
    } as never)
    .select("id")
    .single();
  placeIds.push(must(data).id);
  return must(data).id as string;
}

async function load(editionId: string) {
  const res = await getWeeklyEditionAdminCore(svc, EDITOR(), editionId);
  expect(res.status).toBe(200);
  return must(res.data);
}

async function auditActions(editionId: string) {
  const { data } = await svc
    .from("admin_audit_log")
    .select("action, actor_id")
    .eq("target_id", editionId)
    .order("created_at");
  return (data ?? []).map((r) => r.action);
}

beforeAll(async () => {
  const service = getServiceClient();
  [admin, organizer] = await Promise.all([
    createTestUser(service),
    createTestUser(service),
  ]);
  const { data: settings } = await svc
    .from("weekly_program_setting")
    .select("*")
    .eq("id", 1)
    .single();
  original = settings as SettingsRow;
  await svc
    .from("weekly_program_setting")
    .update({ max_items_per_section: 3 } as never)
    .eq("id", 1);
  resetWeeklySettingsCache();

  const { data: scope } = await svc
    .from("weekly_scope")
    .insert({
      slug: `it-accra-${TOKEN}`,
      name: `Accra ${TOKEN}`,
      centre: "SRID=4326;POINT(-0.187 5.6037)",
      radius_km: 35,
    } as never)
    .select("id")
    .single();
  scopeId = must(scope).id;
  scopeIds.push(scopeId);
});

afterAll(async () => {
  if (editionIds.length)
    await svc.from("weekly_edition").delete().in("id", editionIds);
  if (scopeIds.length) {
    await svc.from("weekly_edition").delete().in("scope_id", scopeIds);
    await svc.from("weekly_scope").delete().in("id", scopeIds);
  }
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
  await svc.from("incident").delete().like("title", `%${TOKEN}%`);
  const service = getServiceClient();
  for (const u of [admin, organizer])
    if (u) await deleteTestUser(service, u.id);
});

describe("creating editions", () => {
  it("refuses people without weekly.edit", async () => {
    const res = await createWeeklyEditionCore(svc, VIEWER(), {
      scopeId,
      weekStart: WEEK_A,
      title: "Nope",
      useTemplate: true,
    });
    expect(res.status).toBe(403);
    expect((await listWeeklyEditionsCore(svc, ctx([]), {})).status).toBe(403);
  });

  it("creates an edition with the default sections, audited, once per area and week", async () => {
    const res = await createWeeklyEditionCore(svc, EDITOR(), {
      scopeId,
      weekStart: WEEK_A,
      title: `  Accra ${TOKEN}  `,
      subtitle: "",
      intro: "Line one\n\n\n\nLine two",
      useTemplate: true,
    });
    expect(res.status).toBe(200);
    const id = must(res.data).id;
    editionIds.push(id);

    const doc = await load(id);
    expect(doc.edition.title).toBe(`Accra ${TOKEN}`);
    expect(doc.edition.subtitle).toBeNull();
    expect(doc.edition.intro).toBe("Line one\n\nLine two");
    expect(doc.edition.status).toBe("draft");
    expect(doc.sections.map((s) => s.kind)).toEqual([
      "editorial",
      "weekend",
      "new",
      "free",
      "top_places",
    ]);
    expect(doc.validation.canPublish).toBe(false);
    expect(doc.validation.errors.map((e) => e.code)).toContain(
      "no_valid_items",
    );
    expect(await auditActions(id)).toContain("weekly.edition.create");

    const again = await createWeeklyEditionCore(svc, EDITOR(), {
      scopeId,
      weekStart: WEEK_A,
      title: "Duplicate",
      useTemplate: false,
    });
    expect(again.status).toBe(409);

    const listed = await listWeeklyEditionsCore(svc, VIEWER(), { scopeId });
    expect(listed.data?.find((r) => r.id === id)?.sectionCount).toBe(5);
  });
});

describe("editing with versions and listing rules", () => {
  let editionId: string;
  let version: number;
  let eventSectionId: string;
  let placeSectionId: string;
  let events: string[];
  let place: string;

  beforeAll(async () => {
    const res = await createWeeklyEditionCore(svc, EDITOR(), {
      scopeId,
      weekStart: WEEK_B,
      title: `Editing ${TOKEN}`,
      useTemplate: true,
    });
    editionId = must(res.data).id;
    editionIds.push(editionId);
    const doc = await load(editionId);
    version = doc.edition.version;
    eventSectionId = must(doc.sections.find((s) => s.kind === "weekend")).id;
    placeSectionId = must(doc.sections.find((s) => s.kind === "top_places")).id;
    events = [
      await makeEvent(`One ${TOKEN}`),
      await makeEvent(`Two ${TOKEN}`),
      await makeEvent(`Three ${TOKEN}`),
      await makeEvent(`Four ${TOKEN}`),
    ];
    place = await makePlace(`Place ${TOKEN}`);
  });

  it("refuses a stale version and changes nothing", async () => {
    const ok = await updateWeeklyEditionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      patch: { title: `Edited ${TOKEN}` },
    });
    expect(ok.status).toBe(200);
    expect(must(ok.data).version).toBe(version + 1);

    const stale = await updateWeeklyEditionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      patch: { title: "Overwrite" },
    });
    expect(stale.status).toBe(409);
    version = must(ok.data).version;
    expect((await load(editionId)).edition.title).toBe(`Edited ${TOKEN}`);
    expect((await load(editionId)).edition.version).toBe(version);
  });

  it("refuses a listing the section does not take, without using up a version", async () => {
    const wrongType = await addWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: eventSectionId,
      subjectType: "place",
      subjectId: place,
    });
    expect(wrongType.status).toBe(400);

    const editorial = must(
      (await load(editionId)).sections.find((s) => s.kind === "editorial"),
    );
    const intoNote = await addWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: editorial.id,
      subjectType: "event",
      subjectId: events[0],
    });
    expect(intoNote.status).toBe(400);
    expect((await load(editionId)).edition.version).toBe(version);
  });

  it("refuses a listing that cannot be featured", async () => {
    const cancelled = await makeEvent(`Cancelled ${TOKEN}`);
    await svc
      .from("event")
      .update({ status: "canceled" } as never)
      .eq("id", cancelled);
    const res = await addWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: eventSectionId,
      subjectType: "event",
      subjectId: cancelled,
    });
    expect(res.status).toBe(400);
    expect(res.message).toContain("cancelled");
  });

  it("adds listings up to the section limit, once each", async () => {
    for (const eventId of events.slice(0, 3)) {
      const res = await addWeeklyItemCore(svc, EDITOR(), {
        editionId,
        expectedVersion: version,
        sectionId: eventSectionId,
        subjectType: "event",
        subjectId: eventId,
        headline: " Don't   miss ",
      });
      expect(res.status, res.message).toBe(200);
      version = must(res.data).version;
    }
    const duplicate = await addWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: eventSectionId,
      subjectType: "event",
      subjectId: events[0],
    });
    expect(duplicate.status).toBe(409);
    const overLimit = await addWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: eventSectionId,
      subjectType: "event",
      subjectId: events[3],
    });
    expect(overLimit.status).toBe(400);
    expect(overLimit.message).toContain("at most 3");

    const placeRes = await addWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: placeSectionId,
      subjectType: "place",
      subjectId: place,
    });
    expect(placeRes.status).toBe(200);
    version = must(placeRes.data).version;

    const section = must(
      (await load(editionId)).sections.find((s) => s.id === eventSectionId),
    );
    expect(section.items.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(section.items[0].headline).toBe("Don't miss");
    expect(section.items[0].source).toBe("manual");
  });

  it("reorders, pins, moves and removes listings, keeping positions contiguous", async () => {
    let section = must(
      (await load(editionId)).sections.find((s) => s.id === eventSectionId),
    );
    const ids = section.items.map((i) => i.id);

    const reordered = await reorderWeeklyItemsCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: eventSectionId,
      itemIds: [ids[2], ids[0], ids[1]],
    });
    expect(reordered.status).toBe(200);
    version = must(reordered.data).version;

    const partial = await reorderWeeklyItemsCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: eventSectionId,
      itemIds: [ids[0]],
    });
    expect(partial.status).toBe(409);
    // Refused before the claim: nothing changed, not even the version.
    expect((await load(editionId)).edition.version).toBe(version);

    const pinned = await updateWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      itemId: ids[0],
      patch: { pinned: true, blurb: "Great for families" },
    });
    expect(pinned.status).toBe(200);
    version = must(pinned.data).version;

    const curated = await addWeeklySectionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      section: { kind: "curated", title: "Also good" },
    });
    expect(curated.status).toBe(200);
    version = must(curated.data).version;

    const moved = await updateWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      itemId: ids[0],
      patch: {},
      moveToSectionId: must(curated.data).sectionId,
    });
    expect(moved.status).toBe(200);
    version = must(moved.data).version;

    const removed = await removeWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      itemId: ids[1],
    });
    expect(removed.status).toBe(200);
    version = must(removed.data).version;

    const doc = await load(editionId);
    section = must(doc.sections.find((s) => s.id === eventSectionId));
    expect(section.items.map((i) => i.id)).toEqual([ids[2]]);
    expect(section.items[0].position).toBe(0);
    const other = must(
      doc.sections.find((s) => s.id === must(curated.data).sectionId),
    );
    expect(other.items[0].pinned).toBe(true);
    expect(other.items[0].blurb).toBe("Great for families");

    const actions = await auditActions(editionId);
    for (const action of [
      "weekly.item.add",
      "weekly.item.reorder",
      "weekly.item.update",
      "weekly.section.create",
      "weekly.item.move",
      "weekly.item.remove",
    ]) {
      expect(actions).toContain(action);
    }
  });

  it("reorders, edits and deletes sections", async () => {
    const doc = await load(editionId);
    const ids = doc.sections.map((s) => s.id);
    const reversed = await reorderWeeklySectionsCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionIds: [...ids].reverse(),
    });
    expect(reversed.status).toBe(200);
    version = must(reversed.data).version;

    const narrowed = await updateWeeklySectionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: placeSectionId,
      patch: { subjectScope: "events" },
    });
    expect(narrowed.status).toBe(400);

    const renamed = await updateWeeklySectionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: placeSectionId,
      patch: { title: "Places we love", iconKey: "heart", isVisible: false },
    });
    expect(renamed.status).toBe(200);
    version = must(renamed.data).version;

    const freeSection = must(doc.sections.find((s) => s.kind === "free"));
    const deleted = await deleteWeeklySectionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: freeSection.id,
    });
    expect(deleted.status).toBe(200);
    version = must(deleted.data).version;

    const after = await load(editionId);
    expect(after.sections.map((s) => s.position)).toEqual(
      after.sections.map((_, i) => i),
    );
    expect(after.sections.find((s) => s.id === placeSectionId)?.isVisible).toBe(
      false,
    );
    expect(after.validation.warnings.map((w) => w.code)).toContain(
      "empty_sections",
    );
  });

  it("finds listings by search, pasted link and event code", async () => {
    const { data: event } = await svc
      .from("event")
      .select("event_code, slug")
      .eq("id", events[3])
      .single();
    const byCode = await searchWeeklySubjectsCore(svc, EDITOR(), {
      q: must(event).event_code,
    });
    expect(byCode.data?.[0]?.subjectId).toBe(events[3]);
    const byLink = await searchWeeklySubjectsCore(svc, EDITOR(), {
      q: `https://abontenhub.com/events/${must(event).event_code.toLowerCase()}`,
    });
    expect(byLink.data?.[0]?.subjectId).toBe(events[3]);
    const byId = await searchWeeklySubjectsCore(svc, EDITOR(), {
      q: place,
      subjectType: "place",
    });
    expect(byId.data?.[0]?.subjectType).toBe("place");
    expect(
      (await searchWeeklySubjectsCore(svc, VIEWER(), { q: "any" })).status,
    ).toBe(403);
  });
});

describe("lifecycle", () => {
  let editionId: string;
  let version: number;

  beforeAll(async () => {
    const res = await createWeeklyEditionCore(svc, EDITOR(), {
      scopeId,
      weekStart: WEEK_C,
      title: `Lifecycle ${TOKEN}`,
      useTemplate: false,
    });
    editionId = must(res.data).id;
    editionIds.push(editionId);
    version = (await load(editionId)).edition.version;
  });

  it("will not publish an edition with nothing to show, and editors cannot publish", async () => {
    const noPermission = await transitionWeeklyEditionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      action: "publish",
      reason: "Weekly edition",
    });
    expect(noPermission.status).toBe(403);

    const empty = await transitionWeeklyEditionCore(svc, PUBLISHER(), {
      editionId,
      expectedVersion: version,
      action: "publish",
      reason: "Weekly edition",
    });
    expect(empty.status).toBe(422);
    expect(empty.data?.validation?.errors.map((e) => e.code)).toContain(
      "no_valid_items",
    );
  });

  it("schedules, lets the job publish, unpublishes, archives and restores, auditing each step", async () => {
    const section = await addWeeklySectionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      section: { kind: "curated", title: "Picks" },
    });
    version = must(section.data).version;
    const added = await addWeeklyItemCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      sectionId: must(section.data).sectionId,
      subjectType: "event",
      subjectId: await makeEvent(`Lifecycle event ${TOKEN}`),
    });
    expect(added.status).toBe(200);
    version = must(added.data).version;

    const past = await transitionWeeklyEditionCore(svc, PUBLISHER(), {
      editionId,
      expectedVersion: version,
      action: "schedule",
      scheduledFor: new Date(Date.now() - 60_000).toISOString(),
      reason: "Weekly edition",
    });
    expect(past.status).toBe(400);

    const scheduled = await transitionWeeklyEditionCore(svc, PUBLISHER(), {
      editionId,
      expectedVersion: version,
      action: "schedule",
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
      reason: "Weekly edition",
    });
    expect(scheduled.status).toBe(200);
    expect(scheduled.data?.status).toBe("scheduled");

    // Pretend the time has come, then run the scheduler job.
    await svc
      .from("weekly_edition")
      .update({
        scheduled_for: new Date(Date.now() - 1_000).toISOString(),
      } as never)
      .eq("id", editionId);
    const { data: job, error } = await svc.rpc("weekly_publish_due");
    expect(error).toBeNull();
    expect((job as { published: number }).published).toBeGreaterThanOrEqual(1);

    let doc = await load(editionId);
    expect(doc.edition.status).toBe("published");
    version = doc.edition.version;

    const unpublished = await transitionWeeklyEditionCore(svc, PUBLISHER(), {
      editionId,
      expectedVersion: version,
      action: "unpublish",
      reason: "Found a mistake",
    });
    expect(unpublished.status).toBe(200);
    version = must(unpublished.data).version;

    const archived = await transitionWeeklyEditionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      action: "archive",
    });
    expect(archived.status).toBe(200);
    version = must(archived.data).version;

    const editArchived = await updateWeeklyEditionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      patch: { title: "Nope" },
    });
    expect(editArchived.status).toBe(409);
    expect(editArchived.message).toContain("archived");

    const wrongMove = await transitionWeeklyEditionCore(svc, PUBLISHER(), {
      editionId,
      expectedVersion: version,
      action: "unpublish",
      reason: "Not possible",
    });
    expect(wrongMove.status).toBe(409);

    const restored = await transitionWeeklyEditionCore(svc, EDITOR(), {
      editionId,
      expectedVersion: version,
      action: "restore",
    });
    expect(restored.status).toBe(200);
    doc = await load(editionId);
    expect(doc.edition.status).toBe("draft");

    const { data: rows } = await svc
      .from("admin_audit_log")
      .select("action, actor_id, actor_roles, reason")
      .eq("target_id", editionId)
      .like("action", "weekly.edition.%")
      .order("created_at");
    const byAction = Object.fromEntries((rows ?? []).map((r) => [r.action, r]));
    expect(byAction["weekly.edition.schedule"]?.actor_id).toBe(admin.id);
    expect(byAction["weekly.edition.publish"]?.actor_id).toBeNull();
    expect(byAction["weekly.edition.publish"]?.actor_roles).toEqual(["system"]);
    expect(byAction["weekly.edition.unpublish"]?.reason).toBe(
      "Found a mistake",
    );
    expect(byAction["weekly.edition.archive"]).toBeTruthy();
    expect(byAction["weekly.edition.restore"]).toBeTruthy();
  });

  it("keeps a scheduled edition that fails its checks and opens an incident", async () => {
    const res = await createWeeklyEditionCore(svc, EDITOR(), {
      scopeId,
      weekStart: addDays(WEEK_C, 7),
      title: `Broken ${TOKEN}`,
      useTemplate: false,
    });
    const id = must(res.data).id;
    editionIds.push(id);
    // Scheduled directly with no content (the transition would refuse it).
    await svc
      .from("weekly_edition")
      .update({
        status: "scheduled",
        scheduled_for: new Date(Date.now() - 1_000).toISOString(),
      } as never)
      .eq("id", id);
    await svc
      .from("weekly_scope")
      .update({ name: `Accra ${TOKEN}` } as never)
      .eq("id", scopeId);

    const { data: job } = await svc.rpc("weekly_publish_due");
    expect((job as { failed: number }).failed).toBeGreaterThanOrEqual(1);
    expect((await load(id)).edition.status).toBe("scheduled");

    const { data: incidents } = await svc
      .from("incident")
      .select("title, component, status")
      .eq("component", "weekly")
      .like("title", `%${TOKEN}%`);
    expect(incidents?.length).toBe(1);

    await svc.rpc("weekly_publish_due");
    const { data: again } = await svc
      .from("incident")
      .select("id")
      .eq("component", "weekly")
      .like("title", `%${TOKEN}%`);
    expect(again?.length).toBe(1);
    await svc
      .from("weekly_edition")
      .update({ status: "draft", scheduled_for: null } as never)
      .eq("id", id);
  });

  it("gives a preview link only to people who can view editions", async () => {
    expect(
      (await getWeeklyPreviewLinkCore(svc, ctx([]), { editionId })).status,
    ).toBe(403);
    const link = await getWeeklyPreviewLinkCore(svc, VIEWER(), { editionId });
    expect(link.status).toBe(200);
    expect(link.data?.url).toMatch(/\/weekly\/preview\/[0-9a-f-]{36}\.\d+\./);
  });
});

describe("settings and areas", () => {
  it("changes settings with a reason and the last saved time, audited", async () => {
    const current = await getWeeklySettingsCore(svc, VIEWER());
    expect(current.status).toBe(200);
    const denied = await updateWeeklySettingsCore(svc, EDITOR(), {
      expectedUpdatedAt: must(current.data).settings.updatedAt,
      reason: "Testing weekly",
      patch: { maxPerOrganizerPerSection: 2 },
    });
    expect(denied.status).toBe(403);

    const saved = await updateWeeklySettingsCore(svc, CONFIGURER(), {
      expectedUpdatedAt: must(current.data).settings.updatedAt,
      reason: "Testing weekly",
      patch: { maxPerOrganizerPerSection: 2 },
    });
    expect(saved.status).toBe(200);
    expect(saved.data?.maxPerOrganizerPerSection).toBe(2);

    const stale = await updateWeeklySettingsCore(svc, CONFIGURER(), {
      expectedUpdatedAt: must(current.data).settings.updatedAt,
      reason: "Testing weekly",
      patch: { maxPerOrganizerPerSection: 3 },
    });
    expect(stale.status).toBe(409);

    const { data: audit } = await svc
      .from("admin_audit_log")
      .select("before, after, reason")
      .eq("action", "weekly.settings.update")
      .eq("actor_id", admin.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(audit?.reason).toBe("Testing weekly");
    expect(audit?.after).toEqual({ maxPerOrganizerPerSection: 2 });
  });

  it("creates, edits and retires a regional area, and protects the national one", async () => {
    const created = await upsertWeeklyScopeCore(svc, CONFIGURER(), {
      reason: "Pilot area",
      scope: {
        name: `Kumasi ${TOKEN}`,
        slug: `it-kumasi-${TOKEN}`,
        centreLat: 6.6885,
        centreLng: -1.6244,
        radiusKm: 30,
      },
    });
    expect(created.status).toBe(200);
    scopeIds.push(must(created.data).id);
    expect(created.data?.centreLat).toBeCloseTo(6.6885, 3);

    const clash = await upsertWeeklyScopeCore(svc, CONFIGURER(), {
      reason: "Pilot area",
      scope: {
        name: "Again",
        slug: `it-kumasi-${TOKEN}`,
        centreLat: 6.6,
        centreLng: -1.6,
        radiusKm: 10,
      },
    });
    expect(clash.status).toBe(409);

    const retired = await upsertWeeklyScopeCore(svc, CONFIGURER(), {
      scopeId: must(created.data).id,
      expectedUpdatedAt: must(created.data).updatedAt,
      reason: "Pilot over",
      scope: { status: "retired" },
    });
    expect(retired.status).toBe(200);
    expect(retired.data?.status).toBe("retired");

    const scopes = await listWeeklyScopesCore(svc, VIEWER());
    const national = must(must(scopes.data).find((s) => s.slug === "ghana"));
    expect(national.isNational).toBe(true);
    const protectedNational = await upsertWeeklyScopeCore(svc, CONFIGURER(), {
      scopeId: national.id,
      expectedUpdatedAt: national.updatedAt,
      reason: "Should not work",
      scope: { status: "retired" },
    });
    expect(protectedNational.status).toBe(400);
  });
});
