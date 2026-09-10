import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Migration lock_money_path_client_writes: a signed-in user can no longer
// write the money-path tables or call the ticket checkout/issuance functions
// directly (each of these was an exploitable hole: free featuring, price
// tampering, fake transactions, free tickets, re-activating a refunded
// ticket). The server-side code paths that replaced those client writes
// still work, and the stale-checkout sweep now restocks inventory even when
// a buyer triggers it.
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

type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];

describe("money path: clients can't write it", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let eventId: string;
  let ticketTypeId: string;

  // validateCheckoutCore reaches the database through its own service-role
  // client, configured from these env vars in production.
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  const line = (amount: number) => ({
    ticket_type_id: ticketTypeId,
    quantity: 2,
    unit_price: 50,
    discount: 0,
    discounted_units: 0,
    amount,
  });

  // One pending checkout per buyer and event is allowed, so each test
  // starts by setting aside the previous test's checkout.
  async function clearPending() {
    await service
      .from("ticket_checkout")
      .update({ status: "cancelled" })
      .eq("user_id", buyer.id)
      .eq("status", "pending");
  }

  async function serviceCheckout(): Promise<string> {
    await clearPending();
    const { data, error } = await service.rpc("create_ticket_checkout", {
      p_user_id: buyer.id,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_promo_code_id: null,
      p_promo_code_text: null,
      p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      p_lines: [line(100)],
    } as unknown as Args<"create_ticket_checkout">);
    if (error || !data) throw new Error(error?.message);
    return data as string;
  }

  async function ticketQuantity(): Promise<number> {
    const { data } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", ticketTypeId)
      .single();
    return data?.quantity as number;
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    ({ eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    ));
  });

  afterAll(async () => {
    await service.from("ticket_checkout").delete().eq("event_id", eventId);
    await deleteTestEvent(service, eventId);
    await Promise.all(
      [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("refuses direct inserts into every money-path table", async () => {
    const id = crypto.randomUUID();
    const attempts = await Promise.all([
      buyer.client.from("ticket_checkout").insert({
        user_id: buyer.id,
        event_id: eventId,
        ticket_type_id: ticketTypeId,
        quantity: 2,
        unit_price: 50,
        total_price: 0,
      }),
      buyer.client.from("payment_attempt").insert({
        user_id: buyer.id,
        amount: 1,
        currency: "GHS",
        status: "initiated",
      }),
      buyer.client.from("transaction").insert({
        user_id: buyer.id,
        full_name: "x",
        email: buyer.email,
        reason: "Ticket_Purchase",
        amount: 100,
        currency: "GHS",
        status: "successful",
        payment_method: "paystack",
        paystack_reference: `FAKE-${id}`,
      }),
      buyer.client.from("event_promotion_checkout").insert({
        event_id: eventId,
        owner_id: buyer.id,
        tier_id: 1,
        unit_price: 0,
        total_price: 0,
        currency: "GHS",
        status: "pending",
      }),
      buyer.client.from("place_promotion_checkout").insert({
        place_id: id,
        owner_id: buyer.id,
        tier_id: 1,
        unit_price: 0,
        total_price: 0,
        currency: "GHS",
        status: "pending",
      }),
      buyer.client.from("event_promotion").insert({
        event_id: eventId,
        tier_id: 1,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86_400_000).toISOString(),
        promotion_checkout_id: id,
      }),
      buyer.client.from("place_promotion").insert({
        place_id: id,
        tier_id: 1,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 86_400_000).toISOString(),
        promotion_checkout_id: id,
      }),
    ]);
    for (const { error } of attempts) {
      expect(error?.code).toBe("42501");
    }
  });

  it("refuses the free-ticket route: re-pricing a checkout, then issuing it as free", async () => {
    // Opening a checkout at a price of the caller's choosing.
    const direct = await buyer.client.rpc("create_ticket_checkout", {
      p_user_id: buyer.id,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_promo_code_id: null,
      p_promo_code_text: null,
      p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      p_lines: [line(0.01)],
    } as unknown as Args<"create_ticket_checkout">);
    expect(direct.error?.code).toBe("42501");

    const sessionId = await serviceCheckout();

    const repriced = await buyer.client
      .from("ticket_checkout")
      .update({ total_price: 0 })
      .eq("checkout_session_id", sessionId);
    expect(repriced.error?.code).toBe("42501");

    const issued = await buyer.client.rpc("issue_tickets_for_checkout", {
      p_checkout_session_id: sessionId,
      p_user_id: buyer.id,
      p_transaction_id: null,
      p_metadata: {},
      p_ticket_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      p_tickets: [],
    } as unknown as Args<"issue_tickets_for_checkout">);
    expect(issued.error?.code).toBe("42501");

    const { data: rows } = await service
      .from("ticket_checkout")
      .select("total_price, status")
      .eq("checkout_session_id", sessionId);
    expect(rows).toEqual([{ total_price: 100, status: "pending" }]);
  });

  it("stops a buyer editing their own ticket, but still lets the organizer check it in", async () => {
    const sessionId = await serviceCheckout();
    const { data: checkoutRows } = await service
      .from("ticket_checkout")
      .select("id")
      .eq("checkout_session_id", sessionId);
    const { data: ticket, error: ticketError } = await service
      .from("ticket")
      .insert({
        user_id: buyer.id,
        ticket_type_id: ticketTypeId,
        ticket_checkout_id: checkoutRows?.[0]?.id,
        status: "cancelled",
        ticket_code: `T-${crypto.randomUUID().slice(0, 8)}`,
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    expect(ticketError).toBeNull();

    // RLS filters the row out: no error, nothing updated.
    const { data: revived } = await buyer.client
      .from("ticket")
      .update({ status: "active" })
      .eq("id", ticket?.id as string)
      .select("id");
    expect(revived).toEqual([]);

    const { data: checkedIn, error: checkInError } = await organizer.client
      .from("ticket")
      .update({ status: "used" })
      .eq("id", ticket?.id as string)
      .select("status");
    expect(checkInError).toBeNull();
    expect(checkedIn).toEqual([{ status: "used" }]);

    await service
      .from("ticket")
      .delete()
      .eq("id", ticket?.id as string);
  });

  it("restocks inventory when a buyer's own call runs the stale-checkout sweep", async () => {
    const before = await ticketQuantity();
    const sessionId = await serviceCheckout();
    expect(await ticketQuantity()).toBe(before - 2);

    await service
      .from("ticket_checkout")
      .update({ expires_at: new Date(Date.now() - 10 * 60_000).toISOString() })
      .eq("checkout_session_id", sessionId);

    const { error } = await buyer.client.rpc("expire_stale_ticket_checkouts");
    expect(error).toBeNull();

    const { data: rows } = await service
      .from("ticket_checkout")
      .select("status")
      .eq("checkout_session_id", sessionId);
    expect(rows).toEqual([{ status: "expired" }]);
    expect(await ticketQuantity()).toBe(before);
  });

  it("still opens a correctly priced checkout through the server", async () => {
    await clearPending();
    const result = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 3 },
    });
    expect(result.status).toBe(200);

    const { data: rows } = await service
      .from("ticket_checkout")
      .select("quantity, unit_price, total_price, status")
      .eq("checkout_session_id", result.checkoutSessionId as string);
    expect(rows).toEqual([
      { quantity: 3, unit_price: 50, total_price: 150, status: "pending" },
    ]);
  });
});
