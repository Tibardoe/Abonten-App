import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25): the full checkout path (validateCheckoutCore
// — rate limit, stale-checkout sweep, pricing, promo lookup, then the
// create_ticket_checkout transaction) under 10, 50 and 100 simultaneous
// buyers. Two scarce things are raced at once: seats and promo-code uses.
// Each wave prints its latency so a regression in lock contention shows up
// as numbers, not just as a pass. These are laptop-Docker timings, not a
// production capacity figure.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const WAVES = [10, 50, 100] as const;
const SEATS = 7;
const PROMO_USES = 5;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

describe("checkout under 10 / 50 / 100 simultaneous buyers", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyers: TestUser[];
  const events: string[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    buyers = [];
    // Created in batches: the local auth service drops connections when
    // asked for 100 accounts at once.
    for (let i = 0; i < Math.max(...WAVES); i += 25) {
      buyers.push(
        ...(await Promise.all(
          Array.from({ length: 25 }, () => createTestUser(service)),
        )),
      );
    }
  }, 180_000);

  afterAll(async () => {
    for (const id of events) {
      await service.from("ticket_checkout").delete().eq("event_id", id);
      await service.from("promo_code").delete().eq("event_id", id);
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    for (let i = 0; i < buyers.length; i += 25) {
      await Promise.all(
        buyers.slice(i, i + 25).map((b) => deleteTestUser(service, b.id)),
      );
    }
    await deleteTestUser(service, organizer.id);
  }, 180_000);

  for (const wave of WAVES) {
    it(`${wave} buyers, ${SEATS} seats, a code good for ${PROMO_USES} uses: no oversell, no over-redemption`, async () => {
      const { eventId, ticketTypeId } = await createTestEventWithTicketType(
        service,
        organizer.id,
        { quantity: SEATS, price: 50 },
      );
      events.push(eventId);
      const code = `LOAD${wave}${Date.now().toString().slice(-5)}`;
      const { data: promo, error: promoError } = await service
        .from("promo_code")
        .insert({
          event_id: eventId,
          promo_code: code,
          discount_percentage: 10,
          max_uses: PROMO_USES,
          times_used: 0,
          is_active: true,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .select("id")
        .single();
      if (promoError || !promo) throw new Error(promoError?.message);

      const timings: number[] = [];
      const results = await Promise.all(
        // Every other buyer types the code.
        buyers
          .slice(0, wave)
          .map(async (buyer, i) => {
            const started = performance.now();
            const result = await validateCheckoutCore(buyer.client, buyer.id, {
              eventId,
              quantities: { [ticketTypeId]: 1 },
              promoCode: i % 2 === 0 ? code : undefined,
            });
            timings.push(performance.now() - started);
            return result;
          }),
      );

      const ok = results.filter((r) => r.status === 200).length;
      const refused = results.filter((r) => r.status === 409).length;
      const other = results.filter((r) => r.status !== 200 && r.status !== 409);
      timings.sort((a, b) => a - b);
      console.log(
        `LOAD checkout x${wave}: ok=${ok} refused=${refused} other=${other.length} ` +
          `p50=${percentile(timings, 0.5).toFixed(0)}ms p95=${percentile(timings, 0.95).toFixed(0)}ms ` +
          `max=${timings[timings.length - 1].toFixed(0)}ms`,
      );

      // A refusal is a 409 (sold out, or the code is used up) — never a 401,
      // which the mobile app would read as a dead session.
      expect(other).toEqual([]);
      const { data: ticketType } = await service
        .from("ticket_type")
        .select("quantity")
        .eq("id", ticketTypeId)
        .single();
      const { data: checkouts } = await service
        .from("ticket_checkout")
        .select("quantity, discounted_units, status")
        .eq("event_id", eventId)
        .eq("status", "pending");
      const { data: promoAfter } = await service
        .from("promo_code")
        .select("times_used")
        .eq("id", promo.id)
        .single();
      const seatsSold = (checkouts ?? []).reduce((n, c) => n + c.quantity, 0);
      const discounted = (checkouts ?? []).reduce(
        (n, c) => n + (c.discounted_units ?? 0),
        0,
      );

      // Every seat is sold exactly once, and never more than exist. Even
      // the smallest wave has more buyers than seats, and the buyers without
      // a code are refused only when the seats are gone, so every wave sells
      // out.
      expect(ok).toBe(SEATS);
      expect(seatsSold).toBe(ok);
      expect(ticketType?.quantity).toBe(SEATS - ok);
      // The code is never used more times than it allows, and the count
      // matches the discounts actually given.
      expect(promoAfter?.times_used).toBeLessThanOrEqual(PROMO_USES);
      expect(discounted).toBe(promoAfter?.times_used);
    }, 120_000);
  }
});
