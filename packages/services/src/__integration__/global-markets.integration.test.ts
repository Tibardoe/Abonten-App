// Global markets against a real database: the market state machine and its
// audit trail, per-market currency and time zone on listings, per-currency
// credit reporting, and the server-owned home market.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getLocalePreferencesCore,
  updateLocalePreferencesCore,
} from "../markets/localePreferencesCore";
import { invalidateMarketCache } from "../markets/marketConfig";
import { resolveProviderAccount } from "../payments/providers/registry";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const service = getServiceClient();
let admin: TestUser;
let person: TestUser;
let eventId: string;

beforeAll(async () => {
  [admin, person] = await Promise.all([
    createTestUser(service),
    createTestUser(service),
  ]);
  const fixture = await createTestEventWithTicketType(service, admin.id, {
    quantity: 10,
    price: 40,
  });
  eventId = fixture.eventId;
});

afterAll(async () => {
  // Put Kenya back where the seed left it.
  await service
    .from("market")
    .update({ status: "draft" })
    .eq("country_code", "KE");
  await service
    .from("market_event")
    .delete()
    .eq("country_code", "KE")
    .eq("actor_id", admin.id);
  invalidateMarketCache();
  await deleteTestEvent(service, eventId).catch(() => undefined);
  await Promise.all([
    deleteTestUser(service, admin.id),
    deleteTestUser(service, person.id),
  ]);
});

describe("market state machine", () => {
  it("moves only along allowed edges, demands readiness to activate, and audits the real from-status", async () => {
    const prepare = await service.rpc("market_transition", {
      p_country_code: "KE",
      p_transition: "prepare",
      p_actor_id: admin.id,
      p_reason: "integration test",
    });
    expect(prepare.error).toBeNull();
    expect((prepare.data as { status: string }).status).toBe("preparing");

    const skip = await service.rpc("market_transition", {
      p_country_code: "KE",
      p_transition: "activate",
      p_actor_id: admin.id,
      p_readiness_ok: true,
    });
    expect(skip.error?.message).toMatch(
      /cannot activate from status preparing/,
    );

    const unready = await service.rpc("market_transition", {
      p_country_code: "KE",
      p_transition: "mark_ready",
      p_actor_id: admin.id,
    });
    expect(unready.error?.message).toMatch(/readiness/);

    const { data: trail } = await service
      .from("market_event")
      .select("action, from_status, to_status")
      .eq("country_code", "KE")
      .eq("actor_id", admin.id);
    expect(trail).toEqual([
      { action: "prepare", from_status: "draft", to_status: "preparing" },
    ]);
  });

  it("never lets the default market be paused", async () => {
    const res = await service.rpc("market_transition", {
      p_country_code: "GH",
      p_transition: "pause",
      p_actor_id: admin.id,
    });
    expect(res.error?.message).toMatch(/default market/);
  });

  it("keeps clients out of market configuration", async () => {
    const read = await person.client.from("market").select("country_code");
    expect(read.data ?? []).toEqual([]);
    const call = await person.client.rpc("market_transition", {
      p_country_code: "KE",
      p_transition: "prepare",
      p_actor_id: person.id,
    });
    expect(call.error?.code).toBe("42501");
  });
});

describe("listings carry their market", () => {
  it("stores the event's country, zone and currency and returns them from discovery", async () => {
    const { data: ev } = await service
      .from("event")
      .select("country_code, timezone, currency, slug")
      .eq("id", eventId)
      .single();
    expect(ev).toMatchObject({
      country_code: "GH",
      timezone: "Africa/Accra",
      currency: "GHS",
    });

    const { data: rows, error } = await service.rpc("get_filtered_events", {
      p_min_price: null as unknown as number,
      p_max_price: null as unknown as number,
      p_start_date: null as unknown as string,
      p_end_date: null as unknown as string,
      p_user_lat: 5.6037,
      p_user_lng: -0.187,
      p_max_distance_km: 50,
      // The fixture's slug is unique, so the page holds exactly this event.
      p_search_text: ev?.slug as string,
      p_event_category: null as unknown as string,
      p_event_type: null as unknown as string[],
      p_min_rating: null as unknown as number,
      p_page_size: 50,
    });
    expect(error).toBeNull();
    const mine = (rows ?? []).find((r) => r.id === eventId);
    expect(mine).toMatchObject({
      timezone: "Africa/Accra",
      country_code: "GH",
      currency: "GHS",
    });
  });

  it("refuses a ticket tier in another currency than its event", async () => {
    const { error } = await service.from("ticket_type").insert({
      event_id: eventId,
      type: "VIP",
      price: 10,
      quantity: 5,
      currency: "NGN",
    });
    expect(error).not.toBeNull();
  });
});

describe("per-currency reporting", () => {
  it("reports credit and campaign money one currency at a time", async () => {
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    const gh = await service.rpc("admin_rewards_overview", {
      p_from: from,
      p_to: to,
    });
    expect(gh.error).toBeNull();
    expect((gh.data as { currency: string }).currency).toBe("GHS");
    const ng = await service.rpc("admin_rewards_overview", {
      p_from: from,
      p_to: to,
      p_currency: "NGN",
    });
    expect(
      (ng.data as { balances: { accounts: number } }).balances.accounts,
    ).toBe(0);
    const content = await service.rpc("content_admin_overview", {
      p_from: from,
      p_to: to,
      p_currency: "NGN",
    });
    expect(content.error).toBeNull();
    expect(
      (content.data as { campaigns: { currency: string; paidMinor: number } })
        .campaigns,
    ).toMatchObject({
      currency: "NGN",
      paidMinor: 0,
    });
  });
});

describe("home market", () => {
  it("cannot be written by the client, only through the service to an open market", async () => {
    const direct = await person.client
      .from("user_info")
      .update({ country_code: "NG" })
      .eq("id", person.id);
    expect(direct.error?.code).toBe("42501");

    const closed = await updateLocalePreferencesCore(person.id, {
      countryCode: "NG",
    });
    expect(closed.status).toBe(400);

    const ok = await updateLocalePreferencesCore(person.id, {
      countryCode: "gh",
      displayCurrency: "gbp",
      distanceUnit: "mi",
    });
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({
      countryCode: "GH",
      displayCurrency: "GBP",
      distanceUnit: "mi",
    });
    expect(
      (await getLocalePreferencesCore(person.id)).data?.displayCurrency,
    ).toBe("GBP");

    const badCurrency = await updateLocalePreferencesCore(person.id, {
      displayCurrency: "ZZZ",
    });
    expect(badCurrency.status).toBe(400);
  });

  it("the client may still change its own display preferences directly", async () => {
    const res = await person.client
      .from("user_info")
      .update({ distance_unit: "km" as never })
      .eq("id", person.id);
    expect(res.error).toBeNull();
  });
});

describe("provider routing", () => {
  it("routes a market's charge to its own account and never to another market's keys", async () => {
    invalidateMarketCache();
    const gh = await resolveProviderAccount({
      countryCode: "GH",
      currency: "GHS",
      method: "card",
    });
    expect(gh.account).toMatchObject({
      provider: "paystack",
      countryCode: "GH",
      settlementCurrency: "GHS",
    });
    await expect(
      resolveProviderAccount({
        countryCode: "NG",
        currency: "NGN",
        method: "card",
      }),
    ).rejects.toThrow(
      /PAYSTACK_NG_SECRET_KEY|not configured|No enabled payment provider/,
    );
  });
});
