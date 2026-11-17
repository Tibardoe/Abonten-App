import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// A held checkout says when a payment for it is already under way, so the
// apps offer "Check payment" instead of "Pay" / "Release" (a second Pay
// would start a second charge, and the server refuses a release while a
// charge is open). Found on 2026-11-17: a mobile-money payment on a weak
// connection left the checkout under "Continue checkout" with both.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getUserPendingTicketCheckoutsCore } from "../checkout/getUserPendingTicketCheckoutsCore";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import {
  type TestEventFixture,
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("pending checkouts: payment in progress", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  // One event per checkout: a buyer holds one open checkout per event.
  const fixtures: TestEventFixture[] = [];

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    buyer = await createTestUser(service);
  });

  afterAll(async () => {
    await service.from("payment_attempt").delete().eq("user_id", buyer.id);
    for (const f of fixtures) {
      await deleteTestEvent(service, f.eventId).catch(() => undefined);
    }
    await Promise.all(
      [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function openSession(): Promise<string> {
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    fixtures.push(fixture);
    const opened = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId: fixture.eventId,
      quantities: { [fixture.ticketTypeId]: 1 },
    });
    expect(opened.status, opened.message).toBe(200);
    return opened.checkoutSessionId as string;
  }

  async function attempt(
    checkoutSessionId: string,
    status: "initiated" | "pending" | "fulfillment_failed" | "failed",
    mode: "direct" | "popup",
  ): Promise<string> {
    const { data, error } = await service
      .from("payment_attempt")
      .insert({
        user_id: buyer.id,
        checkout_session_id: checkoutSessionId,
        amount: 52.5,
        credit_amount: 0,
        currency: "GHS",
        country_code: "GH",
        provider: "paystack",
        provider_reference: `PIP-${crypto.randomUUID()}`,
        status,
        metadata: { mode, method: "mobile_money", charge_minor: 5250 },
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data?.id as string;
  }

  async function sessionFor(checkoutSessionId: string) {
    const result = await getUserPendingTicketCheckoutsCore(
      buyer.client,
      buyer.id,
    );
    expect(result.status).toBe(200);
    if (result.status !== 200) throw new Error("unreachable");
    return result.sessions.find(
      (s) => s.checkoutSessionId === checkoutSessionId,
    );
  }

  it("a checkout with no payment started has none in progress", async () => {
    const id = await openSession();
    expect((await sessionFor(id))?.paymentInProgress).toBeNull();
  });

  it("a pending charge is a payment awaiting confirmation", async () => {
    const id = await openSession();
    const attemptId = await attempt(id, "pending", "direct");
    expect((await sessionFor(id))?.paymentInProgress).toMatchObject({
      attemptId,
      stage: "awaiting",
    });
  });

  it("a direct charge just sent counts; a payment page never finished does not", async () => {
    const direct = await openSession();
    const directAttempt = await attempt(direct, "initiated", "direct");
    expect((await sessionFor(direct))?.paymentInProgress?.attemptId).toBe(
      directAttempt,
    );

    const popup = await openSession();
    await attempt(popup, "initiated", "popup");
    expect((await sessionFor(popup))?.paymentInProgress).toBeNull();
  });

  it("paid with the tickets not out yet is finishing", async () => {
    const id = await openSession();
    await attempt(id, "fulfillment_failed", "direct");
    expect((await sessionFor(id))?.paymentInProgress?.stage).toBe("finishing");
  });

  it("a failed charge leaves the checkout payable", async () => {
    const id = await openSession();
    await attempt(id, "failed", "direct");
    expect((await sessionFor(id))?.paymentInProgress).toBeNull();
  });
});
