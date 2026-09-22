import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Covers migration 20260922120000_event_capacity_and_free_event_promo_guards:
//   - ticket quantities that are set must fit inside event.capacity;
//   - ticket types WITHOUT a quantity share the seats the capacity has left
//     after those, across every purchase path (create_ticket_checkout);
//   - the rule holds under concurrent buyers (deferred trigger + per-event
//     advisory lock);
//   - a free event (FREE tier) and an active promo code never coexist.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type TierSpec = { type: string; price: number; quantity: number | null };

async function createEvent(
  service: SupabaseClient<Database>,
  organizerId: string,
  capacity: number | null,
  tiers: TierSpec[],
  promoCodes: { promo_code: string }[] | null = null,
) {
  return service.rpc("create_event", {
    p_client_request_id: crypto.randomUUID(),
    p_organizer_id: organizerId,
    p_title: "Capacity Test Event",
    p_slug: `capacity-test-event-${crypto.randomUUID()}`,
    p_description: "Created by the integration test suite.",
    p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    p_event_category: "conference",
    p_event_type: ["Live Concerts"],
    p_latitude: 5.6037,
    p_longitude: -0.187,
    p_address: { city: "Accra", country: "Ghana" },
    p_capacity: capacity,
    p_website_url: null,
    p_flyer_public_id: "test/flyer",
    p_flyer_version: "1",
    p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    p_ends_at: new Date(Date.now() + 90_000_000).toISOString(),
    p_require_registration: false,
    p_featured: false,
    p_specific_dates: null,
    p_ticket_types: tiers.map((t) => ({
      ...t,
      currency: "GHS",
      available_from: null,
      available_until: null,
    })),
    p_promo_codes: promoCodes
      ? promoCodes.map((p) => ({
          ...p,
          discount_percentage: 10,
          expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          max_uses: 5,
        }))
      : null,
    p_receiving_account: null,
    p_place_id: null,
    // Same generated-type gap the fixture helper documents.
  } as unknown as Database["public"]["Functions"]["create_event"]["Args"]);
}

async function tierIds(service: SupabaseClient<Database>, eventId: string) {
  const { data } = await service
    .from("ticket_type")
    .select("id, type, price, quantity")
    .eq("event_id", eventId);
  const byType = new Map(
    (data ?? []).map((t) => [
      t.type as string,
      t as { id: string; price: number; quantity: number | null },
    ]),
  );
  return byType;
}

function reserve(
  service: SupabaseClient<Database>,
  buyerId: string,
  eventId: string,
  lines: { ticketTypeId: string; quantity: number; price: number }[],
) {
  return service.rpc("create_ticket_checkout", {
    p_user_id: buyerId,
    p_event_id: eventId,
    p_occurrence_id: null,
    p_promo_code_id: null,
    p_promo_code_text: null,
    p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    p_lines: lines.map((l) => ({
      ticket_type_id: l.ticketTypeId,
      quantity: l.quantity,
      unit_price: l.price,
      discount: 0,
      discounted_units: 0,
      amount: l.price * l.quantity,
    })),
  } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"]);
}

describe("event capacity vs ticket quantities", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  const eventIds: string[] = [];
  const users: TestUser[] = [];

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
  });

  afterEach(async () => {
    for (const id of eventIds.splice(0)) await deleteTestEvent(service, id);
    for (const u of users.splice(0)) await deleteTestUser(service, u.id);
    await deleteTestUser(service, organizer.id);
  });

  it("refuses ticket quantities that add up to more than the capacity at creation", async () => {
    const { data, error } = await createEvent(service, organizer.id, 100, [
      { type: "Standard", price: 50, quantity: 60 },
      { type: "VIP", price: 120, quantity: 50 },
    ]);
    if (data) eventIds.push(data as string);
    expect(error?.message).toBe(
      "Ticket quantities total 110, which exceeds the event capacity of 100.",
    );
  });

  it("accepts quantities that exactly fill the capacity, and unset ones beside a set one", async () => {
    const exact = await createEvent(service, organizer.id, 100, [
      { type: "Standard", price: 50, quantity: 60 },
      { type: "VIP", price: 120, quantity: 40 },
    ]);
    expect(exact.error).toBeNull();
    eventIds.push(exact.data as string);

    const mixed = await createEvent(service, organizer.id, 100, [
      { type: "Standard", price: 50, quantity: 100 },
      { type: "VIP", price: 120, quantity: null },
    ]);
    expect(mixed.error).toBeNull();
    eventIds.push(mixed.data as string);

    const none = await createEvent(service, organizer.id, null, [
      { type: "Standard", price: 50, quantity: 100 },
      { type: "VIP", price: 120, quantity: 50 },
    ]);
    expect(none.error).toBeNull();
    eventIds.push(none.data as string);
  });

  it("gives a type without a quantity only the seats the set quantities leave over", async () => {
    const { data: eventId, error } = await createEvent(
      service,
      organizer.id,
      100,
      [
        { type: "Standard", price: 50, quantity: 60 },
        { type: "VIP", price: 120, quantity: null },
      ],
    );
    expect(error).toBeNull();
    eventIds.push(eventId as string);
    const tiers = await tierIds(service, eventId as string);
    const vip = tiers.get("VIP");
    const standard = tiers.get("Standard");
    if (!vip || !standard) throw new Error("tiers missing");

    const buyers = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    users.push(...buyers);

    // The shared pool is 100 - 60 = 40 seats.
    const forty = await reserve(service, buyers[0].id, eventId as string, [
      { ticketTypeId: vip.id, quantity: 40, price: 120 },
    ]);
    expect(forty.error).toBeNull();

    const oneMore = await reserve(service, buyers[1].id, eventId as string, [
      { ticketTypeId: vip.id, quantity: 1, price: 120 },
    ]);
    expect(oneMore.error?.message).toBe("This event is sold out.");

    // Standard keeps its own 60 seats.
    const standardOne = await reserve(
      service,
      buyers[1].id,
      eventId as string,
      [{ ticketTypeId: standard.id, quantity: 1, price: 50 }],
    );
    expect(standardOne.error).toBeNull();

    // A pool with a few seats left names the number.
    const { data: shared } = await service.rpc(
      "event_shared_capacity_left" as never,
      { p_event_id: eventId } as never,
    );
    expect(shared).toBe(0);

    // Cancelling the 40 gives the pool back.
    await service
      .from("ticket_checkout")
      .update({ status: "cancelled" })
      .eq("user_id", buyers[0].id)
      .eq("event_id", eventId as string);
    const again = await reserve(service, buyers[2].id, eventId as string, [
      { ticketTypeId: vip.id, quantity: 39, price: 120 },
    ]);
    expect(again.error).toBeNull();
    const two = await reserve(service, buyers[0].id, eventId as string, [
      { ticketTypeId: vip.id, quantity: 2, price: 120 },
    ]);
    expect(two.error?.message).toBe("Only 1 spot is left for this event.");
  });

  it("shares the whole capacity across several types with no quantity", async () => {
    const { data: eventId, error } = await createEvent(
      service,
      organizer.id,
      100,
      [
        { type: "Standard", price: 50, quantity: null },
        { type: "VIP", price: 120, quantity: null },
      ],
    );
    expect(error).toBeNull();
    eventIds.push(eventId as string);
    const tiers = await tierIds(service, eventId as string);
    const vip = tiers.get("VIP");
    const standard = tiers.get("Standard");
    if (!vip || !standard) throw new Error("tiers missing");

    const buyers = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    users.push(...buyers);

    const full = await reserve(service, buyers[0].id, eventId as string, [
      { ticketTypeId: standard.id, quantity: 50, price: 50 },
      { ticketTypeId: vip.id, quantity: 50, price: 120 },
    ]);
    expect(full.error).toBeNull();

    const overflow = await reserve(service, buyers[1].id, eventId as string, [
      { ticketTypeId: standard.id, quantity: 1, price: 50 },
    ]);
    expect(overflow.error?.message).toBe("This event is sold out.");
  });

  it("never oversells the shared pool under concurrent buyers", async () => {
    const POOL = 3;
    const BUYER_COUNT = 8;
    const { data: eventId, error } = await createEvent(
      service,
      organizer.id,
      10,
      [
        { type: "Standard", price: 50, quantity: 10 - POOL },
        { type: "VIP", price: 120, quantity: null },
      ],
    );
    expect(error).toBeNull();
    eventIds.push(eventId as string);
    const vip = (await tierIds(service, eventId as string)).get("VIP");
    if (!vip) throw new Error("tier missing");

    const buyers = await Promise.all(
      Array.from({ length: BUYER_COUNT }, () => createTestUser(service)),
    );
    users.push(...buyers);

    const results = await Promise.all(
      buyers.map((b) =>
        reserve(service, b.id, eventId as string, [
          { ticketTypeId: vip.id, quantity: 1, price: 120 },
        ]),
      ),
    );
    const succeeded = results.filter((r) => !r.error);
    expect(succeeded).toHaveLength(POOL);
    for (const r of results.filter((r) => r.error)) {
      expect(r.error?.message).toMatch(
        /sold out|spots? (is|are) left|Not enough spots/i,
      );
    }

    const { count } = await service
      .from("ticket_checkout")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId as string)
      .eq("status", "pending");
    expect(count).toBe(POOL);
  });

  it("refuses an organizer raising a quantity or lowering the capacity past the rule", async () => {
    const { data: eventId, error } = await createEvent(
      service,
      organizer.id,
      100,
      [
        { type: "Standard", price: 50, quantity: 60 },
        { type: "VIP", price: 120, quantity: 40 },
      ],
    );
    expect(error).toBeNull();
    eventIds.push(eventId as string);
    const standard = (await tierIds(service, eventId as string)).get(
      "Standard",
    );
    if (!standard) throw new Error("tier missing");

    // A direct client write, bypassing the service layer.
    const raise = await organizer.client
      .from("ticket_type")
      .update({ quantity: 61 })
      .eq("id", standard.id);
    expect(raise.error?.message).toBe(
      "Ticket quantities total 101, which exceeds the event capacity of 100.",
    );

    const shrink = await organizer.client
      .from("event")
      .update({ capacity: 99 })
      .eq("id", eventId as string);
    expect(shrink.error?.message).toBe(
      "Ticket quantities total 100, which exceeds the event capacity of 99.",
    );

    const lift = await organizer.client
      .from("event")
      .update({ capacity: null })
      .eq("id", eventId as string);
    expect(lift.error).toBeNull();
  });
});

describe("free events have no promo codes", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  const eventIds: string[] = [];

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
  });

  afterEach(async () => {
    for (const id of eventIds.splice(0)) await deleteTestEvent(service, id);
    await deleteTestUser(service, organizer.id);
  });

  it("refuses promo codes on a free event at creation", async () => {
    const { data, error } = await createEvent(
      service,
      organizer.id,
      100,
      [{ type: "FREE", price: 0, quantity: 100 }],
      [{ promo_code: "EARLY" }],
    );
    if (data) eventIds.push(data as string);
    expect(error?.message).toMatch(/aren't available on a free event/);
  });

  it("refuses an organizer adding or re-activating a code on a free event", async () => {
    const { data: eventId, error } = await createEvent(
      service,
      organizer.id,
      100,
      [{ type: "FREE", price: 0, quantity: 100 }],
    );
    expect(error).toBeNull();
    eventIds.push(eventId as string);

    const insert = await organizer.client.from("promo_code").insert({
      event_id: eventId as string,
      promo_code: "LATE",
      discount_percentage: 10,
      max_uses: 5,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      is_active: true,
    });
    expect(insert.error?.message).toMatch(/aren't available on a free event/);

    // An inactive code may exist (history) — but not come back to life.
    const inactive = await service
      .from("promo_code")
      .insert({
        event_id: eventId as string,
        promo_code: "OLD",
        discount_percentage: 10,
        max_uses: 5,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        is_active: false,
      })
      .select("id")
      .single();
    expect(inactive.error).toBeNull();
    const revive = await organizer.client
      .from("promo_code")
      .update({ is_active: true })
      .eq("id", inactive.data?.id as string);
    expect(revive.error?.message).toMatch(/aren't available on a free event/);
  });

  it("refuses making an event free while it still has an active promo code", async () => {
    const { data: eventId, error } = await createEvent(
      service,
      organizer.id,
      100,
      [{ type: "Standard", price: 50, quantity: null }],
      [{ promo_code: "TENOFF" }],
    );
    expect(error).toBeNull();
    eventIds.push(eventId as string);

    const free = await organizer.client.from("ticket_type").insert({
      event_id: eventId as string,
      type: "FREE",
      price: 0,
      currency: "GHS",
      quantity: 100,
    });
    expect(free.error?.message).toMatch(/active promo codes/);

    // Only the organizer may change a code's terms (guard_promo_code_update),
    // which is why updateEventTicketTypesCore retires codes as the caller.
    const retire = await organizer.client
      .from("promo_code")
      .update({ is_active: false })
      .eq("event_id", eventId as string);
    expect(retire.error).toBeNull();
    await service
      .from("ticket_type")
      .delete()
      .eq("event_id", eventId as string);
    const freeNow = await organizer.client.from("ticket_type").insert({
      event_id: eventId as string,
      type: "FREE",
      price: 0,
      currency: "GHS",
      quantity: 100,
    });
    expect(freeNow.error).toBeNull();
  });
});
