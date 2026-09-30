import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Launched areas and the waiting list (migration 20260930100000): the
// defaults change nothing, a coming-soon city and a launched_areas market
// say "not launched" and take people on the list, launching tells each
// person once and empties their rows, clients can neither read the list nor
// send the notices, and deleting an account clears the person's rows.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getAreaLaunchOverviewAdminCore,
  setCoverageModeAdminCore,
  setRegionLaunchAdminCore,
} from "../admin/markets/areaLaunchAdminCore";
import {
  getAreaCoverageCore,
  getAreaWaitlistStatusCore,
  joinAreaWaitlistCore,
  leaveAreaWaitlistCore,
} from "../markets/areaWaitlistCore";
import { invalidateMarketCache } from "../markets/marketConfig";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const service = getServiceClient();
// The admin cores take the service-role client type.
const adminSvc = service as unknown as ServiceRoleClient;

const ADUM = { lat: 6.6936, lng: -1.6266 }; // central Kumasi
const HO = { lat: 6.6008, lng: 0.4713 }; // Volta, outside every listed city
const OSU = { lat: 5.556, lng: -0.1823 }; // Accra

let admin: TestUser;
let fan: TestUser;
let friend: TestUser;
let leaver: TestUser;
let kumasiId: string;

function ctx(permissions: string[]): AdminContext {
  return {
    userId: admin.id,
    email: null,
    roles: ["operations"],
    permissions: permissions as AdminContext["permissions"],
    reauthenticatedAt: Date.now(),
  };
}

async function resetGhana() {
  await service
    .from("market_region")
    .update({ launch_status: "launched" })
    .eq("country_code", "GH");
  await service
    .from("market")
    .update({ coverage_mode: "everywhere" })
    .eq("country_code", "GH");
  invalidateMarketCache();
}

beforeAll(async () => {
  [admin, fan, friend, leaver] = await Promise.all([
    createTestUser(service),
    createTestUser(service),
    createTestUser(service),
    createTestUser(service),
  ]);
  const { data } = await service
    .from("market_region")
    .select("id")
    .eq("country_code", "GH")
    .eq("slug", "kumasi")
    .single();
  kumasiId = data?.id as string;
  await resetGhana();
});

afterAll(async () => {
  await service
    .from("area_waitlist")
    .delete()
    .in("user_id", [fan.id, friend.id, leaver.id]);
  await resetGhana();
  await Promise.all(
    [admin, fan, friend, leaver].map((u) => deleteTestUser(service, u.id)),
  );
});

describe("launched areas", () => {
  it("changes nothing with the defaults", async () => {
    for (const point of [ADUM, HO, OSU]) {
      expect((await getAreaCoverageCore(point)).kind).toBe("open");
    }
    const join = await joinAreaWaitlistCore(fan.id, {
      ...ADUM,
      source: "app",
    });
    expect(join.status).toBe(409);
  });

  it("takes people on the list for a coming-soon city, once each, at city level", async () => {
    const marked = await setRegionLaunchAdminCore(
      adminSvc,
      ctx(["markets.manage"]),
      { countryCode: "GH", regionId: kumasiId, launchStatus: "coming_soon" },
    );
    expect(marked.status).toBe(200);

    const coverage = await getAreaCoverageCore(ADUM);
    expect(coverage.kind).toBe("not_launched");
    if (coverage.kind === "not_launched") {
      expect(coverage.region?.slug).toBe("kumasi");
      expect(coverage.browse.cities.length).toBeGreaterThan(0);
      expect(coverage.browse.cities.map((c) => c.region.slug)).not.toContain(
        "kumasi",
      );
    }

    const first = await joinAreaWaitlistCore(fan.id, {
      ...ADUM,
      label: "Your location",
      source: "app",
    });
    expect(first).toMatchObject({
      status: 200,
      data: { waiting: true, areaName: "Kumasi" },
    });
    // Across town is the same area: no second row.
    const again = await joinAreaWaitlistCore(fan.id, {
      lat: 6.64,
      lng: -1.58,
      source: "web",
    });
    expect(again.status).toBe(200);
    await joinAreaWaitlistCore(friend.id, { ...ADUM, source: "web" });

    const { data: rows } = await service
      .from("area_waitlist")
      .select("region_id, label, lat, lng, country_code")
      .eq("user_id", fan.id);
    expect(rows).toEqual([
      {
        region_id: kumasiId,
        label: "Kumasi",
        lat: 6.69,
        lng: -1.63,
        country_code: "GH",
      },
    ]);

    const status = await getAreaWaitlistStatusCore(fan.id, {
      lat: 6.7,
      lng: -1.6,
    });
    expect(status.data).toEqual({ waiting: true, areaName: "Kumasi" });
    expect((await getAreaWaitlistStatusCore(fan.id, OSU)).data?.waiting).toBe(
      false,
    );
  });

  it("decides a point outside every city by the market's mode", async () => {
    expect(
      (await joinAreaWaitlistCore(friend.id, { ...HO, source: "app" })).status,
    ).toBe(409);

    const mode = await setCoverageModeAdminCore(
      adminSvc,
      ctx(["markets.manage"]),
      { countryCode: "GH", mode: "launched_areas" },
    );
    expect(mode.status).toBe(200);
    expect((await getAreaCoverageCore(HO)).kind).toBe("not_launched");
    expect((await getAreaCoverageCore(OSU)).kind).toBe("open");

    const joined = await joinAreaWaitlistCore(friend.id, {
      ...HO,
      label: "Ho, Volta, Ghana",
      source: "app",
    });
    expect(joined.data).toEqual({ waiting: true, areaName: "Ho, Volta" });

    const leaverJoin = await joinAreaWaitlistCore(leaver.id, {
      ...HO,
      label: "Ho",
      source: "web",
    });
    expect(leaverJoin.status).toBe(200);
    const left = await leaveAreaWaitlistCore(leaver.id, {
      lat: HO.lat + 0.02,
      lng: HO.lng,
    });
    expect(left.data?.waiting).toBe(false);
    const { count } = await service
      .from("area_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("user_id", leaver.id);
    expect(count).toBe(0);
  });

  it("shows staff who is waiting where", async () => {
    const overview = await getAreaLaunchOverviewAdminCore(
      adminSvc,
      ctx(["markets.view"]),
      "GH",
    );
    expect(overview.status).toBe(200);
    const kumasi = overview.data?.regions.find((r) => r.regionId === kumasiId);
    expect(kumasi?.waiting).toBeGreaterThanOrEqual(2);
    expect(overview.data?.outside.some((o) => o.label === "Ho, Volta")).toBe(
      true,
    );

    const denied = await getAreaLaunchOverviewAdminCore(
      adminSvc,
      ctx([]),
      "GH",
    );
    expect(denied.status).toBe(403);
  });

  it("keeps the list away from clients", async () => {
    const anon: SupabaseClient<Database> = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    for (const client of [anon, fan.client]) {
      const read = await client.from("area_waitlist").select("id");
      expect(read.error?.code).toBe("42501");
      const write = await client.from("area_waitlist").insert({
        user_id: fan.id,
        country_code: "GH",
        area_key: "point:0.00,0.00",
        label: "x",
        lat: 0,
        lng: 0,
        source: "web",
      });
      expect(write.error).not.toBeNull();
      const notify = await client.rpc("area_waitlist_notify", {
        p_region_id: kumasiId,
      });
      expect(notify.error).not.toBeNull();
    }
  });

  it("tells each person once when the city launches, and empties their rows", async () => {
    const launched = await setRegionLaunchAdminCore(
      adminSvc,
      ctx(["markets.manage"]),
      {
        countryCode: "GH",
        regionId: kumasiId,
        launchStatus: "launched",
        notifyWaiting: true,
      },
    );
    expect(launched.status).toBe(200);
    // At least our two (a reused local stack may hold other people waiting
    // in Kumasi); each of ours is told exactly once, checked below.
    expect(launched.data?.notified).toBeGreaterThanOrEqual(2);
    for (const person of [fan, friend]) {
      const { count } = await service
        .from("notification")
        .select("id", { count: "exact", head: true })
        .eq("user_id", person.id)
        .eq("type", "area_launched");
      expect(count).toBe(1);
    }

    const { data: notices } = await service
      .from("notification")
      .select("id, type, title, link, data")
      .eq("user_id", fan.id)
      .eq("type", "area_launched");
    expect(notices).toHaveLength(1);
    expect(notices?.[0].title).toBe("Abonten is now in Kumasi");
    expect(notices?.[0].link).toMatch(/^\/explore\/kumasi\?lat=/);
    expect(notices?.[0].data).toMatchObject({
      kind: "area",
      regionId: kumasiId,
    });

    const { data: delivery } = await service
      .from("notification_delivery")
      .select("channel, source, status")
      .eq("notification_id", notices?.[0].id as string);
    expect(delivery).toEqual([
      { channel: "push", source: "app", status: "queued" },
    ]);

    const { count } = await service
      .from("area_waitlist")
      .select("id", { count: "exact", head: true })
      .in("user_id", [fan.id]);
    expect(count).toBe(0);
    // Ho is not in Kumasi's radius: still waiting.
    expect((await getAreaWaitlistStatusCore(friend.id, HO)).data?.waiting).toBe(
      true,
    );

    const again = await service.rpc("area_waitlist_notify", {
      p_region_id: kumasiId,
    });
    expect(again.data).toBe(0);
    expect((await getAreaCoverageCore(ADUM)).kind).toBe("open");
  });

  it("clears the person's rows when the account is deleted", async () => {
    expect((await getAreaWaitlistStatusCore(friend.id, HO)).data?.waiting).toBe(
      true,
    );
    const { error } = await service.rpc("anonymize_deleted_account", {
      p_user_id: friend.id,
    });
    expect(error).toBeNull();
    const { count } = await service
      .from("area_waitlist")
      .select("id", { count: "exact", head: true })
      .eq("user_id", friend.id);
    expect(count).toBe(0);
  });
});
