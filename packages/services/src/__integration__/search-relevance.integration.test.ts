import type { Database } from "@abonten/types/database.types";
import type { DiscoveryProgram } from "@abonten/types/discoveryType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchCore } from "../search/searchCore";
import {
  type SearchFixtures,
  createSearchFixtures,
  eventIdsFor as eventIdsWith,
  nextInMonth,
  placeIdsFor as placeIdsWith,
} from "./searchFixtures";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Search relevance (migration 20260919091000): the curated vocabulary
// (search_concept), dates read out of the query, and multi-word recall —
// against a real local stack. Fixtures carry a unique token so assertions
// only compare them with each other.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const svc = getServiceClient() as unknown as ServiceRoleClient;
const anon = createClient<Database>(
  process.env.SUPABASE_TEST_URL as string,
  process.env.SUPABASE_TEST_ANON_KEY as string,
  { auth: { persistSession: false } },
);

// Short on purpose: a long shared token is most of a query and of a title,
// and the typo fallback compares the two whole (threshold 0.45). Since
// migration 20261002140000 that fallback keeps the dates of a dated search,
// so the token's length no longer decides whether a June event slips into
// a December search (it did, on some runs, on 2026-10-01).
const TOKEN = `zr${Date.now().toString(36).slice(-4)}`;

const ON: DiscoveryProgram = {
  searchV2: true,
  organizerSearch: true,
  placeSearch: true,
  personalization: false,
  prompts: false,
  recommendationEmail: false,
};

let organizer: TestUser;
let fixtures: SearchFixtures;
const conceptTerms: string[] = [];

const makeEvent: SearchFixtures["makeEvent"] = (opts) =>
  fixtures.makeEvent(opts);
const makePlace: SearchFixtures["makePlace"] = (name, description) =>
  fixtures.makePlace(name, description);
const eventIdsFor = (query: string) => eventIdsWith(anon, query);
const placeIdsFor = (query: string) => placeIdsWith(anon, query);

beforeAll(async () => {
  organizer = await createTestUser(getServiceClient());
  await svc
    .from("user_info")
    .update({ username: `${TOKEN}_org`, full_name: "Relevance Org" })
    .eq("id", organizer.id);
  fixtures = createSearchFixtures(svc, () => organizer.id);
});

afterAll(async () => {
  await fixtures.cleanup();
  if (conceptTerms.length) {
    await svc
      .from("search_concept" as never)
      .delete()
      .in("term", conceptTerms);
  }
  if (organizer) await deleteTestUser(getServiceClient(), organizer.id);
});

describe("vocabulary (search_concept)", () => {
  let beansSpot: string;
  let gobeNamed: string;
  let exactBeans: string;
  let redRedEvent: string;

  beforeAll(async () => {
    beansSpot = await makePlace(
      `${TOKEN} Auntie Esi's Corner`,
      "The best beans and fried plantain in Osu, with gari and palm oil.",
    );
    gobeNamed = await makePlace(
      `${TOKEN} Gob3 Joint`,
      "Lunch every weekday from 11.",
    );
    exactBeans = await makePlace(
      `${TOKEN} Beans`,
      "A small kitchen by the roundabout.",
    );
    redRedEvent = await makeEvent({
      title: `${TOKEN} Red Red Sunday`,
      description: "Beans stew and ripe plantain for the whole family.",
      category: "Food & Drink",
      startsAt: new Date(Date.now() + 72 * 3_600_000),
    });
  });

  it("finds places and events whose words express the term (gob3 -> beans, plantain)", async () => {
    const places = await placeIdsFor(`${TOKEN} gob3`);
    expect(places).toContain(gobeNamed); // the word itself
    expect(places).toContain(beansSpot); // beans / plantain
    expect(await eventIdsFor(`${TOKEN} gob3`)).toContain(redRedEvent);
  });

  it("works in the other direction (plantain -> gob3)", async () => {
    expect(await placeIdsFor(`${TOKEN} plantain`)).toContain(gobeNamed);
  });

  it("ranks the literal match above a related one", async () => {
    const places = await placeIdsFor(`${TOKEN} beans`);
    expect(places.indexOf(exactBeans)).toBeGreaterThanOrEqual(0);
    expect(places.indexOf(gobeNamed)).toBeGreaterThan(
      places.indexOf(exactBeans),
    );
  });

  it("never turns a specific query into a broad one", async () => {
    // Every word must still match (itself or an alternative): the token
    // keeps other people's food listings out.
    const places = await placeIdsFor(`${TOKEN} gob3`);
    for (const id of places) expect(fixtures.placeIds).toContain(id);
  });

  it("is data: a new row takes effect without a deploy, and can be switched off", async () => {
    const term = `${TOKEN}dish`;
    conceptTerms.push(term);
    // The name shares nothing with the term, so only the vocabulary row
    // can connect them (no text or typo match).
    const spot = await makePlace(
      "Omo Tuo House",
      "Rice balls with groundnut soup.",
    );
    expect(await placeIdsFor(term)).not.toContain(spot);

    await svc.from("search_concept" as never).insert({
      term,
      expands_to: ["rice balls", "omo tuo"],
      applies_to: ["place"],
    } as never);
    expect(await placeIdsFor(term)).toContain(spot);

    await svc
      .from("search_concept" as never)
      .update({ enabled: false } as never)
      .eq("term", term);
    expect(await placeIdsFor(term)).not.toContain(spot);
  });

  it("serves the vocabulary to no client role", async () => {
    const { data, error } = await anon
      .from("search_concept" as never)
      .select("*")
      .limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

describe("dates in the query", () => {
  let december: string;
  let june: string;
  let literalDecember: string;

  beforeAll(async () => {
    december = await makeEvent({
      title: `${TOKEN} Harmattan Jazz`,
      startsAt: nextInMonth(12),
    });
    june = await makeEvent({
      title: `${TOKEN} Rainy Season Jazz`,
      startsAt: nextInMonth(6),
    });
    literalDecember = await makeEvent({
      title: `${TOKEN} December To Remember`,
      startsAt: nextInMonth(7),
    });
  });

  it("reads a month as a date window and keeps the other words", async () => {
    const ids = await eventIdsFor(`${TOKEN} jazz december`);
    expect(ids).toContain(december);
    expect(ids).not.toContain(june);
  });

  it("still finds a title that literally says the month", async () => {
    expect(await eventIdsFor(`${TOKEN} december`)).toContain(literalDecember);
  });

  it("lists the month's events when the month is the only word", async () => {
    // Other fixtures may exist in December too; ours must be there.
    const { data } = await anon.rpc("search_events", {
      p_query: "december",
      p_page_size: 50,
    });
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).toContain(december);
    expect(ids).not.toContain(june);
  });
});

describe("multi-word recall", () => {
  let afrowave: string;
  let precise: string;

  beforeAll(async () => {
    afrowave = await makeEvent({
      title: `${TOKEN} Afrowave Fest`,
      startsAt: new Date(Date.now() + 96 * 3_600_000),
    });
    precise = await makeEvent({
      title: `${TOKEN} Afro Wave Night`,
      startsAt: new Date(Date.now() + 96 * 3_600_000),
    });
  });

  it("finds the words run together, below the exact phrase", async () => {
    const ids = await eventIdsFor(`${TOKEN} afro wave`);
    expect(ids).toContain(precise);
    expect(ids).toContain(afrowave);
    expect(ids.indexOf(precise)).toBeLessThan(ids.indexOf(afrowave));
  });
});

describe("through the service", () => {
  it("returns related results in the mixed screen", async () => {
    const res = await searchCore(
      anon,
      { q: `${TOKEN} gob3`, mode: "all" },
      { program: ON, platform: "web", log: false, loggingEnabled: false },
    );
    expect(res.status).toBe(200);
    expect(res.places.items.length).toBeGreaterThan(0);
  });
});
