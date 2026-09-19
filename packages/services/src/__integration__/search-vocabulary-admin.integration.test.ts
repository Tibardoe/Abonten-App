import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteSearchConceptCore,
  getSearchVocabularyCore,
  previewSearchConceptCore,
  saveSearchConceptCore,
} from "../admin/discovery/searchVocabularyAdminCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Admin › Discovery › Vocabulary (migration 20260919100000): the gap report
// built from search_query_log, the preview of what a term would match, and
// saving / editing / removing a term — audited, permission-checked, with
// optimistic concurrency — and that a saved term changes what search finds.

const svc = getServiceClient() as unknown as ServiceRoleClient;
const anon = createClient<Database>(
  process.env.SUPABASE_TEST_URL as string,
  process.env.SUPABASE_TEST_ANON_KEY as string,
  { auth: { persistSession: false } },
);

const TOKEN = `zv${Date.now().toString(36)}`;
// Unrelated to TOKEN, so the typo fallback cannot find the place by itself.
const TERM = `q${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
const WORD = `${TOKEN}stew`;

let owner: TestUser;
let admin: TestUser;
let placeId: string;
const logIds: number[] = [];

function ctx(permissions: string[]): AdminContext {
  return {
    userId: admin.id,
    email: null,
    roles: ["operations"],
    permissions: permissions as AdminContext["permissions"],
    reauthenticatedAt: Date.now(),
  };
}

beforeAll(async () => {
  owner = await createTestUser(svc);
  admin = await createTestUser(svc);
  await svc.from("admin_user").upsert({ user_id: admin.id, status: "active" });
  const { data, error } = await svc
    .from("place")
    .insert({
      owner_id: owner.id,
      name: `${TOKEN} Kitchen`,
      slug: `${TOKEN}-kitchen`,
      description: `Home of the famous ${WORD} and more.`,
      category_id: 1,
      location: "SRID=4326;POINT(-0.187 5.6037)",
      address: { full_address: "Osu, Accra" },
      cover_public_id: "test/cover",
      cover_version: "1",
      status: "published",
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`place insert failed: ${error.message}`);
  placeId = data.id;

  // Two searches for the term that found nothing, one for a word the
  // vocabulary already knows ("gob3") that nobody opened.
  const { data: logs, error: logError } = await svc
    .from("search_query_log")
    .insert([
      {
        query_norm: TERM,
        mode: "text",
        surface: "all",
        platform: "android",
        event_count: 0,
        place_count: 0,
        organizer_count: 0,
      },
      {
        query_norm: TERM,
        mode: "text",
        surface: "places",
        platform: "web",
        event_count: 0,
        place_count: 0,
        organizer_count: 0,
      },
      {
        query_norm: `gob3 ${TOKEN}`,
        mode: "text",
        surface: "all",
        platform: "ios",
        event_count: 0,
        place_count: 1,
        organizer_count: 0,
      },
    ] as never)
    .select("id");
  if (logError) throw new Error(`log insert failed: ${logError.message}`);
  logIds.push(...(logs as { id: number }[]).map((l) => l.id));
});

afterAll(async () => {
  if (logIds.length)
    await svc.from("search_query_log").delete().in("id", logIds);
  await svc.from("search_concept").delete().eq("term", TERM);
  if (placeId) await svc.from("place").delete().eq("id", placeId);
  await svc.from("admin_user").delete().eq("user_id", admin.id);
  await deleteTestUser(svc, owner.id);
  await deleteTestUser(svc, admin.id);
});

async function placeIdsFor(query: string): Promise<string[]> {
  const { data, error } = await anon.rpc("search_places", {
    p_query: query,
    p_page_size: 50,
  } as never);
  expect(error).toBeNull();
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

describe("admin search vocabulary", () => {
  it("reports searches that found nothing, and whether the vocabulary knows them", async () => {
    const res = await getSearchVocabularyCore(svc, ctx(["discovery.view"]));
    expect(res.status).toBe(200);
    const gap = res.data?.gaps.find((g) => g.query_norm === TERM);
    expect(gap).toMatchObject({
      searches: 2,
      zero_results: 2,
      clicks: 0,
      covered: false,
    });
    const known = res.data?.gaps.find((g) => g.query_norm === `gob3 ${TOKEN}`);
    expect(known).toMatchObject({ zero_results: 0, clicks: 0, covered: true });
    expect(res.data?.concepts.some((c) => c.term === "gob3")).toBe(true);
  });

  it("previews what a term would match before it is saved", async () => {
    const res = await previewSearchConceptCore(svc, ctx(["discovery.view"]), {
      term: TERM,
      expandsTo: [WORD],
      appliesTo: ["place"],
    });
    expect(res.status).toBe(200);
    expect(res.data?.places?.count).toBe(1);
    expect(res.data?.places?.samples).toEqual([`${TOKEN} Kitchen`]);
    expect(res.data?.events).toBeUndefined();
  });

  it("refuses changes without discovery.configure", async () => {
    const res = await saveSearchConceptCore(svc, ctx(["discovery.view"]), {
      term: TERM,
      expandsTo: [WORD],
      appliesTo: ["place"],
      enabled: true,
      reason: "should not work",
    });
    expect(res.status).toBe(403);
  });

  it("adds, edits (with concurrency) and removes a term, audited, and search follows it", async () => {
    const can = ctx(["discovery.view", "discovery.configure"]);
    expect(await placeIdsFor(TERM)).not.toContain(placeId);

    const added = await saveSearchConceptCore(svc, can, {
      term: `  ${TERM.toUpperCase()} `,
      expandsTo: [WORD, WORD, TERM],
      appliesTo: ["place"],
      enabled: true,
      note: "test",
      reason: "Two searches found nothing",
    });
    expect(added.status).toBe(200);
    expect(added.data).toMatchObject({ term: TERM, expandsTo: [WORD] });
    expect(await placeIdsFor(TERM)).toContain(placeId);

    const duplicate = await saveSearchConceptCore(svc, can, {
      term: TERM,
      expandsTo: [WORD],
      appliesTo: ["place"],
      enabled: true,
      reason: "adding it twice",
    });
    expect(duplicate.status).toBe(409);

    const id = added.data?.id as number;
    const switchedOff = await saveSearchConceptCore(svc, can, {
      id,
      expectedUpdatedAt: added.data?.updatedAt,
      term: TERM,
      expandsTo: [WORD],
      appliesTo: ["place"],
      enabled: false,
      reason: "switching it off for now",
    });
    expect(switchedOff.status).toBe(200);
    expect(await placeIdsFor(TERM)).not.toContain(placeId);

    const stale = await saveSearchConceptCore(svc, can, {
      id,
      expectedUpdatedAt: added.data?.updatedAt,
      term: TERM,
      expandsTo: [WORD],
      appliesTo: ["place"],
      enabled: true,
      reason: "an edit from an old tab",
    });
    expect(stale.status).toBe(409);

    const removed = await deleteSearchConceptCore(svc, can, {
      id,
      reason: "not needed any more",
    });
    expect(removed.status).toBe(200);

    const { data: audit } = await svc
      .from("admin_audit_log")
      .select("action, target_id, reason")
      .eq("actor_id", admin.id)
      .eq("target_type", "search_concept")
      .order("created_at");
    expect(audit?.map((a) => a.action)).toEqual([
      "discovery.vocabulary.create",
      "discovery.vocabulary.update",
      "discovery.vocabulary.delete",
    ]);
    expect(audit?.every((a) => a.target_id === String(id))).toBe(true);
  });
});
