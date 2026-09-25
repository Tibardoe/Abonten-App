import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25). The event-creation outage had a sibling:
// the organizer dashboard answered 500 in production ("permission denied
// for table market") — get_organizer_dashboard → get_organizer_sales_timeline
// → default_market_currency(), a SECURITY INVOKER function that reads the
// service-only market table, called with the organizer's own session. Every
// read the apps make with a person's (or a visitor's) session must be able
// to run with that session's rights; this suite calls them the way the apps
// do and fails on any permission error, whatever the result.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fetchOrganizerDashboard,
  fetchOrganizerEventPerformance,
  fetchOrganizerSalesTimeline,
} from "../organizer/organizerDashboardQuery";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const PERMISSION = /permission denied/i;

describe("reads the apps make with a person's own session", () => {
  let service: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let organizer: TestUser;
  let eventId: string;

  beforeAll(async () => {
    service = getServiceClient();
    anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    organizer = await createTestUser(service);
    ({ eventId } = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 20,
    }));
  });

  afterAll(async () => {
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await deleteTestUser(service, organizer.id);
  });

  it("the organizer dashboard loads for every period", async () => {
    for (const period of ["today", "7d", "30d", "all"] as const) {
      const dash = await fetchOrganizerDashboard(organizer.client, period);
      expect(dash.status, `dashboard ${period}`).toBe(200);
      const timeline = await fetchOrganizerSalesTimeline(
        organizer.client,
        period,
      );
      expect(timeline.status, `sales timeline ${period}`).toBe(200);
      const perf = await fetchOrganizerEventPerformance(
        organizer.client,
        period,
      );
      expect(perf.status, `event performance ${period}`).toBe(200);
    }
  });

  it("the market helpers answer a signed-in person and a visitor", async () => {
    for (const client of [organizer.client, anon]) {
      for (const fn of [
        "default_market_country",
        "default_market_currency",
        "default_market_timezone",
      ]) {
        const { error } = await client.rpc(fn as never);
        // A function a client may not call at all is fine (PGRST202 /
        // 42501 on EXECUTE); one it may call must not fail inside.
        if (error && !/function/i.test(error.message)) {
          expect(error.message, fn).not.toMatch(PERMISSION);
        }
      }
    }
  });

  it("a place's open-now check works for a visitor", async () => {
    // Its own place: with none in the database the call never reached the
    // zone lookup, and this passed while visitors got "permission denied
    // for function default_market_timezone" (migration 20260925111800).
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error: placeError } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: organizer.id,
        name: "Open-now check",
        description: "Created by the session-rpc-reachability suite.",
        cover_public_id: "place_covers/open-now-check",
        cover_version: "1",
        slug: `open-now-${crypto.randomUUID()}`,
        category_id: category?.id,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra" },
        status: "published",
      } as never)
      .select("id")
      .single();
    if (placeError || !place) throw new Error(placeError?.message);
    try {
      const { data, error } = await anon.rpc("place_is_open_now", {
        p_place_id: place.id,
      } as never);
      expect(error?.message ?? "").not.toMatch(PERMISSION);
      expect(data).toBe(false);
    } finally {
      await service.from("place").delete().eq("id", place.id);
    }
  });
});
