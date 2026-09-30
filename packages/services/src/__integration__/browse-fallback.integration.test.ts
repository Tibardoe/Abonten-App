// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Browse fallback (migration 20260930120000): the per-market setting, the
// activity counts behind "most active", that a strategy can never offer a
// city that isn't launched, and that the waiting list keeps one row per
// person per area however it is joined (repeated taps, both apps at once,
// across town, before and after a city is added).
import { areaCoverage } from "@abonten/core/market/coverage";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getAreaLaunchOverviewAdminCore,
  setBrowseFallbackAdminCore,
} from "../admin/markets/areaLaunchAdminCore";
import {
  getAreaWaitlistStatusCore,
  joinAreaWaitlistCore,
} from "../markets/areaWaitlistCore";
import { invalidateMarketCache } from "../markets/marketConfig";
import { getMarketContextCore } from "../markets/marketContextCore";
import { invalidateRegionActivity } from "../markets/regionActivity";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const service = getServiceClient();
const adminSvc = service as unknown as ServiceRoleClient;

const ADUM = { lat: 6.6936, lng: -1.6266 }; // central Kumasi
const HO = { lat: 6.6008, lng: 0.4713 }; // outside every listed city
const CAPE_COAST = { lat: 5.1053, lng: -1.2466 };

let admin: TestUser;
let fan: TestUser;
let wanderer: TestUser;
const eventIds: string[] = [];
const placeIds: string[] = [];
const regionIds: Record<string, string> = {};
let tempRegionId: string | null = null;

function ctx(permissions: string[]): AdminContext {
  return {
    userId: admin.id,
    email: null,
    roles: ["operations"],
    permissions: permissions as AdminContext["permissions"],
    reauthenticatedAt: Date.now(),
  };
}

function fresh() {
  invalidateMarketCache();
  invalidateRegionActivity();
}

async function resetGhana() {
  await service
    .from("market")
    .update({
      coverage_mode: "everywhere",
      browse_fallback: "choose",
      browse_fallback_region_id: null,
      browse_fallback_limit: 3,
    })
    .eq("country_code", "GH");
  await service
    .from("market_region")
    .update({ launch_status: "launched" })
    .eq("country_code", "GH");
  fresh();
}

async function activity(): Promise<Map<string, number[]>> {
  const { data, error } = await service.rpc("market_region_activity", {});
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((r) => [
      r.region_id,
      [Number(r.upcoming_events), Number(r.places)],
    ]),
  );
}

async function contextMarkets() {
  fresh();
  const result = await getMarketContextCore({ platform: "web" });
  return result;
}

async function countRows(userId: string) {
  const { count } = await service
    .from("area_waitlist")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

beforeAll(async () => {
  [admin, fan, wanderer] = await Promise.all([
    createTestUser(service),
    createTestUser(service),
    createTestUser(service),
  ]);
  const { data } = await service
    .from("market_region")
    .select("id, slug")
    .eq("country_code", "GH");
  for (const r of data ?? []) regionIds[r.slug] = r.id;
  await resetGhana();
});

afterAll(async () => {
  await service
    .from("area_waitlist")
    .delete()
    .in("user_id", [fan.id, wanderer.id]);
  await resetGhana();
  if (tempRegionId)
    await service.from("market_region").delete().eq("id", tempRegionId);
  for (const id of placeIds) await service.from("place").delete().eq("id", id);
  for (const id of eventIds)
    await deleteTestEvent(service, id).catch(() => undefined);
  fresh();
  await Promise.all(
    [admin, fan, wanderer].map((u) => deleteTestUser(service, u.id)),
  );
});

describe("activity behind 'most active'", () => {
  it("counts upcoming events and places per launched city, and Admin shows the same numbers", async () => {
    const before = await activity();
    for (let i = 0; i < 2; i++) {
      const { eventId } = await createTestEventWithTicketType(
        service,
        admin.id,
        { quantity: 5 },
      );
      eventIds.push(eventId);
    }
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    for (let i = 0; i < 3; i++) {
      const { data: place, error } = await service
        .from("place")
        .insert({
          country_code: "GH",
          timezone: "Africa/Accra",
          owner_id: admin.id,
          name: `Browse test place ${i}`,
          slug: `browse-test-${crypto.randomUUID().slice(0, 8)}`,
          description: "Created by the browse fallback suite.",
          category_id: category?.id as number,
          location: `POINT(${CAPE_COAST.lng} ${CAPE_COAST.lat})`,
          address: { city: "Cape Coast", country: "Ghana" },
          cover_public_id: "test/cover",
          cover_version: "1",
          status: "published",
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      placeIds.push(place.id);
    }
    const after = await activity();
    const accra = regionIds.accra;
    const cape = regionIds["cape-coast"];
    expect(after.get(accra)?.[0]).toBe((before.get(accra)?.[0] ?? 0) + 2);
    expect(after.get(cape)?.[1]).toBe((before.get(cape)?.[1] ?? 0) + 3);

    const overview = await getAreaLaunchOverviewAdminCore(
      adminSvc,
      ctx(["markets.view"]),
      "GH",
    );
    const row = overview.data?.regions.find((r) => r.regionId === cape);
    expect([row?.upcomingEvents, row?.places]).toEqual(after.get(cape));
  });

  it("puts the counts and the setting on the public market context — launched cities only", async () => {
    await service
      .from("market_region")
      .update({ launch_status: "coming_soon" })
      .eq("id", regionIds.kumasi);
    const { markets } = await contextMarkets();
    const gh = markets.find((m) => m.countryCode === "GH");
    expect(gh?.browseFallback).toEqual({
      strategy: "choose",
      regionId: null,
      limit: 3,
    });
    const cape = gh?.regions.find((r) => r.slug === "cape-coast");
    expect(cape?.activity?.places).toBeGreaterThanOrEqual(3);
    expect(gh?.regions.find((r) => r.slug === "kumasi")?.activity).toBe(
      undefined,
    );
    const { data } = await service.rpc("market_region_activity", {});
    expect((data ?? []).some((r) => r.region_id === regionIds.kumasi)).toBe(
      false,
    );
  });
});

describe("the browse fallback setting", () => {
  it("is managed by markets.manage, validated, and audited", async () => {
    const manage = ctx(["markets.manage"]);
    expect(
      (
        await setBrowseFallbackAdminCore(adminSvc, ctx(["markets.view"]), {
          countryCode: "GH",
          strategy: "nearest",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await setBrowseFallbackAdminCore(adminSvc, manage, {
          countryCode: "GH",
          strategy: "sometimes" as never,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await setBrowseFallbackAdminCore(adminSvc, manage, {
          countryCode: "GH",
          strategy: "choose",
          limit: 9,
        })
      ).status,
    ).toBe(400);
    // Kumasi is coming soon: it can't be the suggested city.
    const refused = await setBrowseFallbackAdminCore(adminSvc, manage, {
      countryCode: "GH",
      strategy: "fixed",
      regionId: regionIds.kumasi,
    });
    expect(refused.status).toBe(400);
    expect(refused.message).toMatch(/isn't launched/);

    const saved = await setBrowseFallbackAdminCore(adminSvc, manage, {
      countryCode: "GH",
      strategy: "fixed",
      regionId: regionIds.accra,
    });
    expect(saved.status).toBe(200);
    const { data: market } = await service
      .from("market")
      .select(
        "browse_fallback, browse_fallback_region_id, browse_fallback_limit",
      )
      .eq("country_code", "GH")
      .single();
    expect(market).toEqual({
      browse_fallback: "fixed",
      browse_fallback_region_id: regionIds.accra,
      browse_fallback_limit: 3,
    });
    const { data: audit } = await service
      .from("admin_audit_log")
      .select("summary")
      .eq("action", "markets.browse_fallback")
      .eq("actor_id", admin.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(audit?.summary).toBe("Browse fallback in Ghana: suggest Accra");
  });

  it("offers the chosen city from Kumasi, and never once it stops being launched", async () => {
    let { markets, context } = await contextMarkets();
    let coverage = areaCoverage({
      markets,
      marketCountry: context.marketCountry,
      point: ADUM,
    });
    expect(coverage.kind).toBe("not_launched");
    if (coverage.kind !== "not_launched") return;
    expect(coverage.browse).toMatchObject({
      strategy: "fixed",
      reason: "recommended",
    });
    expect(coverage.browse.cities.map((c) => c.region.slug)).toEqual(["accra"]);

    // Accra later made coming soon: the stored choice stays, but Explore
    // offers the nearest launched city instead, never Accra.
    await service
      .from("market_region")
      .update({ launch_status: "coming_soon" })
      .eq("id", regionIds.accra);
    ({ markets, context } = await contextMarkets());
    coverage = areaCoverage({
      markets,
      marketCountry: context.marketCountry,
      point: ADUM,
    });
    if (coverage.kind !== "not_launched")
      throw new Error("expected not launched");
    expect(coverage.browse.strategy).toBe("nearest");
    const offered = coverage.browse.cities.map((c) => c.region.slug);
    expect(offered).not.toContain("accra");
    expect(offered).not.toContain("kumasi");
    await service
      .from("market_region")
      .update({ launch_status: "launched" })
      .eq("id", regionIds.accra);
  });

  it("forgets a chosen city that is deleted", async () => {
    const { data: region, error } = await service
      .from("market_region")
      .insert({
        country_code: "GH",
        slug: `browse-temp-${crypto.randomUUID().slice(0, 6)}`,
        name: "Browse Temp",
        kind: "city",
        centre_lat: 7.35,
        centre_lng: -2.33,
        radius_km: 15,
        position: 99,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    tempRegionId = region.id;
    fresh();
    const saved = await setBrowseFallbackAdminCore(
      adminSvc,
      ctx(["markets.manage"]),
      { countryCode: "GH", strategy: "fixed", regionId: region.id },
    );
    expect(saved.status).toBe(200);
    await service.from("market_region").delete().eq("id", region.id);
    tempRegionId = null;
    const { data: market } = await service
      .from("market")
      .select("browse_fallback, browse_fallback_region_id")
      .eq("country_code", "GH")
      .single();
    expect(market).toEqual({
      browse_fallback: "fixed",
      browse_fallback_region_id: null,
    });
    await resetGhana();
  });

  it("with no launched city, offers nothing to browse", async () => {
    await service
      .from("market_region")
      .update({ launch_status: "coming_soon" })
      .eq("country_code", "GH");
    const { markets, context } = await contextMarkets();
    const coverage = areaCoverage({
      markets,
      marketCountry: context.marketCountry,
      point: ADUM,
    });
    expect(coverage.kind).toBe("not_launched");
    if (coverage.kind === "not_launched")
      expect(coverage.browse.cities).toEqual([]);
    await resetGhana();
  });
});

describe("waiting list: one row per person per area", () => {
  it("repeated and simultaneous taps from both apps add one row", async () => {
    await service
      .from("market_region")
      .update({ launch_status: "coming_soon" })
      .eq("id", regionIds.kumasi);
    fresh();
    const results = await Promise.all(
      (["web", "app", "web", "app", "app"] as const).map((source) =>
        joinAreaWaitlistCore(fan.id, { ...ADUM, source }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await countRows(fan.id)).toBe(1);
    // Signed out and back in (a new session is the same account): again one.
    const again = await joinAreaWaitlistCore(fan.id, {
      lat: 6.65,
      lng: -1.58,
      source: "web",
    });
    expect(again.data).toEqual({ waiting: true, areaName: "Kumasi" });
    expect(await countRows(fan.id)).toBe(1);
  });

  it("outside every city, joining again from across town or the other app adds nothing", async () => {
    await service
      .from("market")
      .update({ coverage_mode: "launched_areas" })
      .eq("country_code", "GH");
    fresh();
    const first = await joinAreaWaitlistCore(wanderer.id, {
      ...HO,
      label: "Ho",
      source: "app",
    });
    expect(first.status).toBe(200);
    // ~3 km away: a different 1 km cell, the same town.
    const nearby = await joinAreaWaitlistCore(wanderer.id, {
      lat: HO.lat + 0.027,
      lng: HO.lng,
      label: "Ho",
      source: "web",
    });
    expect(nearby.data).toEqual({ waiting: true, areaName: "Ho" });
    expect(await countRows(wanderer.id)).toBe(1);

    // A city is later listed around Ho (coming soon): joining from inside it
    // is the same area, still one row, and the status says waiting.
    const { data: ho, error } = await service
      .from("market_region")
      .insert({
        country_code: "GH",
        slug: `ho-test-${crypto.randomUUID().slice(0, 6)}`,
        name: "Ho Test",
        kind: "city",
        centre_lat: HO.lat,
        centre_lng: HO.lng,
        radius_km: 15,
        position: 98,
        launch_status: "coming_soon",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    tempRegionId = ho.id;
    fresh();
    const inside = await joinAreaWaitlistCore(wanderer.id, {
      lat: HO.lat - 0.02,
      lng: HO.lng,
      source: "app",
    });
    expect(inside.status).toBe(200);
    expect(await countRows(wanderer.id)).toBe(1);
    expect(
      (
        await getAreaWaitlistStatusCore(wanderer.id, {
          lat: HO.lat,
          lng: HO.lng,
        })
      ).data?.waiting,
    ).toBe(true);
    await service.from("market_region").delete().eq("id", ho.id);
    tempRegionId = null;
  });
});
