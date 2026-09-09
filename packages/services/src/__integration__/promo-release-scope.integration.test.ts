import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Promo codes are unique per EVENT, not globally:
//   promo_code_event_id_normalized_code_key UNIQUE (event_id, upper(btrim(code)))
// so the same string legitimately exists on many events -- "EARLYBIRD" is the
// placeholder the create-event wizard's own promo field suggests.
//
// expire_stale_ticket_checkouts() (cron jobid 5, every 5 minutes) used to
// match promo rows by the code string alone, with no event predicate. One
// buyer abandoning a checkout on event A therefore decremented `times_used`
// on every other event's identically-named code, and the paired
// promo_code_usage delete could resolve to the wrong event's promo id and so
// fail to release the buyer's own redemption.
//
// Migration 20260909104858 joins on (event_id, normalized code) instead.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const SHARED_CODE = "EARLYBIRD";

describe("expire_stale_ticket_checkouts: promo release is event-scoped", () => {
  let service: SupabaseClient<Database>;
  let organizerA: TestUser;
  let organizerB: TestUser;
  let buyerA: TestUser;
  let buyerB: TestUser;
  let eventA: string;
  let eventB: string;
  let ticketTypeA: string;
  let promoA: string;
  let promoB: string;

  async function addPromo(
    eventId: string,
    code: string,
    timesUsed: number,
  ): Promise<string> {
    const { data, error } = await service
      .from("promo_code")
      .insert({
        event_id: eventId,
        promo_code: code,
        discount_percentage: 20,
        max_uses: 50,
        times_used: timesUsed,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(`promo insert failed: ${error.message}`);
    return data.id as string;
  }

  async function timesUsed(promoId: string): Promise<number> {
    const { data, error } = await service
      .from("promo_code")
      .select("times_used")
      .eq("id", promoId)
      .single();
    if (error) throw new Error(error.message);
    return Number(data.times_used);
  }

  beforeEach(async () => {
    service = getServiceClient();
    organizerA = await createTestUser(service);
    organizerB = await createTestUser(service);
    buyerA = await createTestUser(service);
    buyerB = await createTestUser(service);

    const a = await createTestEventWithTicketType(service, organizerA.id, {
      quantity: 10,
      price: 100,
    });
    const b = await createTestEventWithTicketType(service, organizerB.id, {
      quantity: 10,
      price: 100,
    });
    eventA = a.eventId;
    eventB = b.eventId;
    ticketTypeA = a.ticketTypeId;

    // Same code string on two unrelated events, each with its own counter.
    promoA = await addPromo(eventA, SHARED_CODE, 5);
    promoB = await addPromo(eventB, SHARED_CODE, 5);

    // Each buyer has redeemed their own event's code once.
    const { error: usageError } = await service
      .from("promo_code_usage")
      .insert([
        { promo_code_id: promoA, user_id: buyerA.id, event_id: eventA },
        { promo_code_id: promoB, user_id: buyerB.id, event_id: eventB },
      ]);
    if (usageError) throw new Error(usageError.message);
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventA);
    await deleteTestEvent(service, eventB);
    for (const u of [organizerA, organizerB, buyerA, buyerB]) {
      await deleteTestUser(service, u.id);
    }
  });

  /** A pending checkout on event A that has already sailed past its deadline. */
  async function insertStaleCheckoutOnA(discountedUnits: number) {
    const { error } = await service.from("ticket_checkout").insert({
      user_id: buyerA.id,
      event_id: eventA,
      ticket_type_id: ticketTypeA,
      quantity: discountedUnits,
      unit_price: 100,
      promo_code: SHARED_CODE,
      discount: 20,
      total_price: 80 * discountedUnits,
      status: "pending",
      checkout_session_id: crypto.randomUUID(),
      // The function only claims rows older than now() - 1 minute.
      expires_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      discounted_units: discountedUnits,
    });
    if (error) throw new Error(`checkout insert failed: ${error.message}`);
  }

  it("releases the abandoning event's counter without touching the other event's", async () => {
    await insertStaleCheckoutOnA(2);

    const { error } = await service.rpc("expire_stale_ticket_checkouts");
    expect(error).toBeNull();

    // Event A gave back its 2 reserved redemptions.
    expect(await timesUsed(promoA)).toBe(3);
    // Event B never had a checkout at all and must be untouched. Before the
    // fix this also dropped to 3, silently handing organizer B's code away.
    expect(await timesUsed(promoB)).toBe(5);
  });

  it("deletes only the abandoning buyer's usage row", async () => {
    await insertStaleCheckoutOnA(2);

    const { error } = await service.rpc("expire_stale_ticket_checkouts");
    expect(error).toBeNull();

    const { data: remaining } = await service
      .from("promo_code_usage")
      .select("promo_code_id, user_id, event_id")
      .in("promo_code_id", [promoA, promoB]);

    // Buyer A can re-apply their code; buyer B's unrelated redemption stands.
    expect(remaining).toHaveLength(1);
    expect(remaining?.[0]).toMatchObject({
      promo_code_id: promoB,
      user_id: buyerB.id,
      event_id: eventB,
    });
  });

  it("matches the code case-insensitively, the way the unique index does", async () => {
    // ticket_checkout.promo_code is stored from user input, so its casing
    // need not match the promo_code row character for character.
    const { error: insertError } = await service
      .from("ticket_checkout")
      .insert({
        user_id: buyerA.id,
        event_id: eventA,
        ticket_type_id: ticketTypeA,
        quantity: 1,
        unit_price: 100,
        promo_code: " earlybird ",
        discount: 20,
        total_price: 80,
        status: "pending",
        checkout_session_id: crypto.randomUUID(),
        expires_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        discounted_units: 1,
      });
    if (insertError) throw new Error(insertError.message);

    const { error } = await service.rpc("expire_stale_ticket_checkouts");
    expect(error).toBeNull();

    expect(await timesUsed(promoA)).toBe(4);
    expect(await timesUsed(promoB)).toBe(5);
  });

  it("still restocks the reserved ticket quantity", async () => {
    const before = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", ticketTypeA)
      .single();

    await insertStaleCheckoutOnA(2);
    const { error } = await service.rpc("expire_stale_ticket_checkouts");
    expect(error).toBeNull();

    const after = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", ticketTypeA)
      .single();

    // The checkout row was inserted directly, so nothing was decremented --
    // the restock is pure gain here. What matters is that the promo scoping
    // change did not disturb it.
    expect(Number(after.data?.quantity)).toBe(
      Number(before.data?.quantity) + 2,
    );
  });
});
