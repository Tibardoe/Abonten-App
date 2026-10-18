import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Page views of events and places from the website and the app (migration
// 20261018192426): anyone may record one, the server stamps the time, the
// listing's own organizer or owner is left out, only the organizer reads an
// event's rows, and the admin console's totals split the app from the web.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchEventOverviewAnalytics } from "../organizer/eventInsightsQuery";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("listing page views", () => {
  let service: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let organizer: TestUser;
  let visitor: TestUser;
  let eventId: string;
  let placeId: string;

  const eventViews = async () => {
    const { data } = await service
      .from("event_analytics_event")
      .select("platform, created_at")
      .eq("event_id", eventId);
    return data ?? [];
  };

  beforeAll(async () => {
    service = getServiceClient();
    anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    organizer = await createTestUser(service);
    visitor = await createTestUser(service);
    ({ eventId } = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 5,
    }));
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: organizer.id,
        name: "Page Views Venue",
        slug: `page-views-${crypto.randomUUID()}`,
        description: "Created by the listing-views suite.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      })
      .select("id")
      .single();
    if (error || !place) throw new Error(`place fixture: ${error?.message}`);
    placeId = place.id;
  });

  afterAll(async () => {
    await service.from("place").delete().eq("id", placeId);
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await deleteTestUser(service, visitor.id);
    await deleteTestUser(service, organizer.id);
  });

  it("records a signed-out visitor's view with its platform and the server's time", async () => {
    const { error } = await anon.from("event_analytics_event").insert({
      event_id: eventId,
      platform: "web",
      created_at: "2020-01-01T00:00:00Z",
    });
    expect(error).toBeNull();
    const rows = await eventViews();
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBe("web");
    expect(new Date(rows[0].created_at).getFullYear()).toBeGreaterThan(2020);
  });

  it("refuses a platform it does not know", async () => {
    const { error } = await anon
      .from("event_analytics_event")
      .insert({ event_id: eventId, platform: "desktop" });
    expect(error?.code).toBe("23514");
  });

  it("leaves out the organizer's own view", async () => {
    const { error } = await organizer.client
      .from("event_analytics_event")
      .insert({ event_id: eventId, platform: "ios" });
    expect(error).toBeNull();
    expect(await eventViews()).toHaveLength(1);
  });

  it("counts another signed-in person's view, which only the organizer can read", async () => {
    await visitor.client
      .from("event_analytics_event")
      .insert({ event_id: eventId, platform: "android" });
    expect(await eventViews()).toHaveLength(2);

    const { data: seenByVisitor } = await visitor.client
      .from("event_analytics_event")
      .select("id")
      .eq("event_id", eventId);
    expect(seenByVisitor).toHaveLength(0);

    const { error: anonRead } = await anon
      .from("event_analytics_event")
      .select("id")
      .eq("event_id", eventId);
    expect(anonRead?.code).toBe("42501");
  });

  it("gives the organizer's insights the views and the app's share", async () => {
    const res = await fetchEventOverviewAnalytics(
      organizer.client,
      organizer.id,
      eventId,
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.data?.page_views).toBe(2);
    expect(res.data?.app_page_views).toBe(1);
  });

  it("leaves out a place owner's own view and keeps a visitor's platform", async () => {
    await organizer.client
      .from("place_analytics_event")
      .insert({ place_id: placeId, event_type: "view", platform: "ios" });
    await anon
      .from("place_analytics_event")
      .insert({ place_id: placeId, event_type: "view", platform: "ios" });
    const { data } = await service
      .from("place_analytics_event")
      .select("platform")
      .eq("place_id", placeId);
    expect(data).toEqual([{ platform: "ios" }]);
  });

  it("totals views and app views for Admin › Analytics", async () => {
    const { data, error } = await service.rpc("admin_listing_views", {
      p_from: new Date(Date.now() - 3_600_000).toISOString(),
      p_to: new Date(Date.now() + 3_600_000).toISOString(),
      p_limit: 100,
    });
    expect(error).toBeNull();
    const result = data as {
      topEvents: { id: string; views: number; appViews: number }[];
      topPlaces: { id: string; views: number; appViews: number }[];
    };
    expect(result.topEvents.find((e) => e.id === eventId)).toMatchObject({
      views: 2,
      appViews: 1,
    });
    expect(result.topPlaces.find((p) => p.id === placeId)).toMatchObject({
      views: 1,
      appViews: 1,
    });
  });

  it("keeps at most 60 views of one event a minute", async () => {
    for (let i = 0; i < 70; i++) {
      await anon
        .from("event_analytics_event")
        .insert({ event_id: eventId, platform: "web" });
    }
    expect(await eventViews()).toHaveLength(60);
  });
});
