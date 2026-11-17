import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Migration 20261117130933: the buyer's order history says what happened
// to an unpaid order's latest try at paying (payment_state), so a declined
// or abandoned payment is not just a silent "Pending" / "Expired".
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

type AttemptStatus =
  | "initiated"
  | "pending"
  | "failed"
  | "cancelled"
  | "fulfillment_failed";

describe("order history: payment state", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let stranger: TestUser;
  // One event per order: a buyer holds one open checkout per event.
  const fixtures: TestEventFixture[] = [];

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    buyer = await createTestUser(service);
    stranger = await createTestUser(service);
  });

  afterAll(async () => {
    await service.from("payment_attempt").delete().eq("user_id", buyer.id);
    for (const f of fixtures) {
      await deleteTestEvent(service, f.eventId).catch(() => undefined);
    }
    await Promise.all(
      [organizer, buyer, stranger].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function order(): Promise<string> {
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
    status: AttemptStatus,
    mode: "direct" | "popup" = "direct",
    secondsAgo = 0,
  ) {
    const { error } = await service.from("payment_attempt").insert({
      user_id: buyer.id,
      checkout_session_id: checkoutSessionId,
      amount: 52.5,
      credit_amount: 0,
      currency: "GHS",
      country_code: "GH",
      provider: "paystack",
      provider_reference: `OHP-${crypto.randomUUID()}`,
      status,
      metadata: { mode, method: "mobile_money", charge_minor: 5250 },
      created_at: new Date(Date.now() - secondsAgo * 1000).toISOString(),
    });
    expect(error).toBeNull();
  }

  async function stateOf(user: TestUser, checkoutSessionId: string) {
    const { data, error } = await user.client.rpc(
      "get_user_transaction_history",
      {
        p_start: null,
        p_end: null,
        p_cursor_created_at: null,
        p_cursor_id: null,
        p_limit: 50,
      } as never,
    );
    expect(error).toBeNull();
    const row = (
      (data ?? []) as { reference: string; payment_state: string | null }[]
    ).find((r) => r.reference === checkoutSessionId);
    return row;
  }

  it("an order with no payment started has none", async () => {
    const id = await order();
    expect((await stateOf(buyer, id))?.payment_state).toBeNull();
  });

  it("a declined payment reads failed; a closed one not completed", async () => {
    const declined = await order();
    await attempt(declined, "failed");
    expect((await stateOf(buyer, declined))?.payment_state).toBe("failed");

    const closed = await order();
    await attempt(closed, "cancelled");
    expect((await stateOf(buyer, closed))?.payment_state).toBe("not_completed");
  });

  it("the latest try speaks: declined, then a charge still awaiting approval", async () => {
    const id = await order();
    await attempt(id, "failed", "direct", 120);
    await attempt(id, "pending", "direct", 0);
    expect((await stateOf(buyer, id))?.payment_state).toBe("awaiting");
  });

  it("a direct charge just sent is awaiting; a payment page never finished is not", async () => {
    const direct = await order();
    await attempt(direct, "initiated", "direct");
    expect((await stateOf(buyer, direct))?.payment_state).toBe("awaiting");

    const popup = await order();
    await attempt(popup, "initiated", "popup");
    expect((await stateOf(buyer, popup))?.payment_state).toBeNull();
  });

  it("paid with the tickets not out yet reads finishing", async () => {
    const id = await order();
    await attempt(id, "fulfillment_failed");
    expect((await stateOf(buyer, id))?.payment_state).toBe("finishing");
  });

  it("nobody else sees the order or its payment", async () => {
    const id = await order();
    await attempt(id, "failed");
    expect(await stateOf(stranger, id)).toBeUndefined();
  });
});
