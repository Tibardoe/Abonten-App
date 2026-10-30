import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Pay small small (migration 20261025100000_ticket_plans) end to end through
// the real services, with Paystack's HTTP calls mocked:
//   - a plan holds its seats as 'on_plan' rows that count against capacity,
//     that the 30-minute sweep leaves alone and that no ordinary checkout
//     can pay for;
//   - parts are verified and recorded; the last one issues the tickets
//     through the plan's settlement (one transaction, the organizer's
//     earning, the platform fee);
//   - ending a plan (deadline, buyer, cancelled event) releases the seats
//     and refunds through each part's own charge, keeping the fee share;
//   - refunding a finished plan's purchase goes back through the parts, and
//     the transaction is refunded once every share has landed;
//   - money for a plan that already ended is refunded in full;
//   - none of it is reachable from the apps.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cancelEventCore } from "../events/cancelEventCore";
import { issueRefundCore } from "../organizer/issueRefundCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import {
  cancelTicketPlanCore,
  getTicketPlanCore,
  getTicketPlanOfferCore,
  payTicketPlanPartCore,
  startTicketPlanCore,
} from "../ticketPlans/ticketPlanCore";
import { runTicketPlanMaintenanceCore } from "../ticketPlans/ticketPlanMaintenanceCore";
import { resetTicketPlanSettingsCache } from "../ticketPlans/ticketPlanProgram";
import { handlePlanPartRefundOutcome } from "../ticketPlans/ticketPlanRefunds";
import { cancelTicketsForTransactionCore } from "../tickets/cancelTicketsForTransactionCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const paystack = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  initializeTransaction: vi.fn(),
  refundTransaction: vi.fn(),
}));

vi.mock("../payments/providers/paystackApi", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyTransaction: paystack.verifyTransaction,
  initializeTransaction: paystack.initializeTransaction,
  refundTransaction: paystack.refundTransaction,
}));

type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];
type SettingRow =
  Database["public"]["Tables"]["ticket_plan_program_setting"]["Row"];

const DAY = 86_400_000;

describe("Pay small small", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let other: TestUser;
  let original: SettingRow;
  let methodId: string;
  const eventIds: string[] = [];

  // Issues tickets straight through the RPC (no QR upload), the way the
  // other payment suites stand in for apps/web's generateTicket.
  const deps: PaymentFulfillmentDeps = {
    issueTickets: async (sessionId, transactionId, metadata, auth) => {
      const { data: rows } = await service
        .from("ticket_checkout")
        .select("id, ticket_type_id, quantity, status")
        .eq("checkout_session_id", sessionId)
        .eq("user_id", auth.userId);
      if ((rows ?? []).every((r) => r.status === "paid"))
        return { status: 200 };
      const tickets = (rows ?? []).flatMap((r) =>
        Array.from({ length: r.quantity }, () => ({
          checkout_id: r.id,
          ticket_type_id: r.ticket_type_id,
          ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
          qr_public_id: "test/qr",
          qr_version: "1",
        })),
      );
      const { error } = await service.rpc("issue_tickets_for_checkout", {
        p_checkout_session_id: sessionId,
        p_user_id: auth.userId,
        p_transaction_id: transactionId,
        p_metadata: JSON.parse(metadata),
        p_ticket_expires_at: new Date(Date.now() + 40 * DAY).toISOString(),
        p_tickets: tickets,
      } as unknown as Args<"issue_tickets_for_checkout">);
      return error ? { status: 500, message: error.message } : { status: 200 };
    },
    activatePlacePromotion: async () => ({ status: 500, message: "not used" }),
    activateEventPromotion: async () => ({ status: 500, message: "not used" }),
  };

  async function createEvent(opts: {
    capacity: number | null;
    quantity: number | null;
    price?: number;
    startsInDays?: number;
  }): Promise<{ eventId: string; ticketTypeId: string }> {
    const starts = Date.now() + (opts.startsInDays ?? 30) * DAY;
    const { data: eventId, error } = await service.rpc("create_event", {
      p_client_request_id: crypto.randomUUID(),
      p_organizer_id: organizer.id,
      p_title: "Pay Small Small Test Event",
      p_slug: `plan-test-event-${crypto.randomUUID()}`,
      p_description: "Created by the integration test suite.",
      p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      p_event_category: "conference",
      p_event_type: ["Live Concerts"],
      p_latitude: 5.6037,
      p_longitude: -0.187,
      p_address: { city: "Accra", country: "Ghana" },
      p_capacity: opts.capacity,
      p_website_url: null,
      p_flyer_public_id: "test/flyer",
      p_flyer_version: "1",
      p_starts_at: new Date(starts).toISOString(),
      p_ends_at: new Date(starts + 4 * 3_600_000).toISOString(),
      p_require_registration: false,
      p_featured: false,
      p_specific_dates: null,
      p_ticket_types: [
        {
          type: "General",
          price: opts.price ?? 100,
          currency: "GHS",
          quantity: opts.quantity,
          available_from: null,
          available_until: null,
        },
      ],
      p_promo_codes: null,
      p_receiving_account: null,
      p_place_id: null,
    } as unknown as Args<"create_event">);
    if (error || !eventId) throw new Error(`create_event: ${error?.message}`);
    eventIds.push(eventId as string);
    const { data: tt } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", eventId as string)
      .single();
    const { error: settingError } = await service
      .from("event_ticket_plan_setting")
      .insert({ event_id: eventId as string, enabled: true });
    expect(settingError).toBeNull();
    return { eventId: eventId as string, ticketTypeId: tt?.id as string };
  }

  async function plan(planId: string) {
    const { data } = await service
      .from("ticket_plan")
      .select("*")
      .eq("id", planId)
      .single();
    return data as Database["public"]["Tables"]["ticket_plan"]["Row"];
  }

  async function quantityOf(ticketTypeId: string) {
    const { data } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", ticketTypeId)
      .single();
    return data?.quantity ?? null;
  }

  /** Starts the charge for a part and confirms it as Paystack would. */
  async function payPart(planId: string, amountMinor: number) {
    const started = await payTicketPlanPartCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { planId, amountMinor, paymentMethodId: methodId },
      (id, attempt) => `https://example.test/ticket-plans/${id}?a=${attempt}`,
    );
    expect(started.status).toBe(200);
    if (started.status !== 200) throw new Error("part not started");
    const reference = started.data.payment.reference;
    paystack.verifyTransaction.mockResolvedValueOnce({
      id: Math.floor(Math.random() * 1e9),
      status: "success",
      reference,
      amount: amountMinor,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 150,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: buyer.email },
      authorization: { signature: `SIG_${crypto.randomUUID()}`, last4: "4081" },
    });
    const result = await finalizePayment(started.data.attemptId, deps);
    return { attemptId: started.data.attemptId, reference, result };
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer, other] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    const { data: setting } = await service
      .from("ticket_plan_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    original = setting as SettingRow;
    await service
      .from("ticket_plan_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTicketPlanSettingsCache();
    const { data: method } = await service
      .from("payment_method")
      .insert({
        user_id: buyer.id,
        method_type: "card",
        details: { brand: "visa", last4: "4081" },
        status: "active",
        is_default: true,
      })
      .select("id")
      .single();
    methodId = method?.id as string;
  });

  afterAll(async () => {
    await service
      .from("ticket_plan_program_setting")
      .update({ enabled: original.enabled, audience: original.audience })
      .eq("id", 1);
    resetTicketPlanSettingsCache();
    await service.from("payment_method").delete().eq("id", methodId);
    await Promise.all(
      [organizer, buyer, other].map((u) => deleteTestUser(service, u.id)),
    );
  });

  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
    paystack.initializeTransaction.mockReset();
    paystack.refundTransaction.mockReset();
    paystack.initializeTransaction.mockImplementation(
      async (_account: unknown, p: { reference: string }) => ({
        reference: p.reference,
        access_code: "test-access",
        authorization_url: "https://checkout.paystack.test/x",
      }),
    );
    paystack.refundTransaction.mockResolvedValue({ status: "pending" });
  });

  afterEach(async () => {
    // Every money invariant the reconciliation job checks still holds.
    const { data: open } = await service
      .from("ticket_plan")
      .select("id, paid_minor")
      .eq("user_id", buyer.id);
    for (const p of open ?? []) {
      const { data: parts } = await service
        .from("ticket_plan_payment")
        .select("amount_minor")
        .eq("plan_id", p.id);
      const sum = (parts ?? []).reduce((a, r) => a + Number(r.amount_minor), 0);
      expect(sum).toBe(Number(p.paid_minor));
    }
  });

  it("offers plans only where the organizer allows them and the deadline is far enough away", async () => {
    const { eventId } = await createEvent({ capacity: 10, quantity: null });
    const offer = await getTicketPlanOfferCore(buyer.id, { eventId });
    expect(offer.status).toBe(200);
    if (offer.status !== 200) return;
    expect(offer.data.available).toBe(true);

    const own = await getTicketPlanOfferCore(organizer.id, { eventId });
    expect(own.status === 200 && own.data).toMatchObject({
      available: false,
      reason: "own_event",
    });

    const soon = await createEvent({
      capacity: 10,
      quantity: null,
      startsInDays: 4,
    });
    const tooSoon = await getTicketPlanOfferCore(buyer.id, {
      eventId: soon.eventId,
    });
    expect(tooSoon.status === 200 && tooSoon.data).toMatchObject({
      available: false,
      reason: "too_soon",
    });

    await service
      .from("event_ticket_plan_setting")
      .update({ enabled: false })
      .eq("event_id", eventId);
    const off = await getTicketPlanOfferCore(buyer.id, { eventId });
    expect(off.status === 200 && off.data).toMatchObject({
      available: false,
      reason: "not_offered",
    });
  });

  it("holds the seats on the plan: they count against capacity, the sweep leaves them, a checkout cannot pay them", async () => {
    const { eventId, ticketTypeId } = await createEvent({
      capacity: 3,
      quantity: null,
    });
    const started = await startTicketPlanCore(buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 2 },
    });
    expect(started.status).toBe(200);
    if (started.status !== 200) return;
    const p = await plan(started.data.planId);
    expect(p.status).toBe("awaiting_payment");
    expect(Number(p.ticket_minor)).toBe(20_000);
    expect(Number(p.total_minor)).toBe(21_000);
    expect(Number(p.first_part_min_minor)).toBe(4_200);
    expect(Number(p.part_min_minor)).toBe(2_100);

    const { data: rows } = await service
      .from("ticket_checkout")
      .select("status, expires_at")
      .eq("checkout_session_id", p.checkout_session_id);
    expect(rows?.map((r) => r.status)).toEqual(["on_plan"]);

    // 3 seats, 2 on the plan: one left for anybody else.
    const { data: left } = await service.rpc("event_shared_capacity_left", {
      p_event_id: eventId,
    });
    expect(left).toBe(1);
    const tooMany = await service.rpc("create_ticket_checkout", {
      p_user_id: other.id,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_promo_code_id: null,
      p_promo_code_text: null,
      p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      p_lines: [
        {
          ticket_type_id: ticketTypeId,
          quantity: 2,
          unit_price: 100,
          discount: 0,
          discounted_units: 0,
          amount: 200,
        },
      ],
    } as unknown as Args<"create_ticket_checkout">);
    expect(tooMany.error?.message).toMatch(/Only 1 spot is left/);

    // The 30-minute sweep only expires 'pending' rows.
    await service
      .from("ticket_checkout")
      .update({ expires_at: new Date(Date.now() - 3_600_000).toISOString() })
      .eq("checkout_session_id", p.checkout_session_id);
    await service.rpc("expire_stale_ticket_checkouts");
    const { data: still } = await service
      .from("ticket_checkout")
      .select("status")
      .eq("checkout_session_id", p.checkout_session_id);
    expect(still?.map((r) => r.status)).toEqual(["on_plan"]);

    // An ordinary paid attempt on the plan's session cannot issue its seats.
    const { data: txn } = await service
      .from("transaction")
      .insert({
        user_id: buyer.id,
        full_name: "Buyer",
        email: buyer.email,
        reason: "Ticket_Purchase",
        amount: 210,
        currency: "GHS",
        status: "successful",
        payment_method: "paystack",
        provider: "paystack",
        provider_reference: `PSK-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();
    await service.from("payment_attempt").insert({
      user_id: buyer.id,
      checkout_session_id: p.checkout_session_id,
      amount: 210,
      currency: "GHS",
      country_code: "GH",
      provider: "paystack",
      provider_reference: `PSK-${crypto.randomUUID()}`,
      status: "processing",
      transaction_id: txn?.id,
    });
    const { data: row } = await service
      .from("ticket_checkout")
      .select("id, ticket_type_id, quantity")
      .eq("checkout_session_id", p.checkout_session_id)
      .single();
    const sneaky = await service.rpc("issue_tickets_for_checkout", {
      p_checkout_session_id: p.checkout_session_id,
      p_user_id: buyer.id,
      p_transaction_id: txn?.id,
      p_metadata: {},
      p_ticket_expires_at: new Date(Date.now() + 40 * DAY).toISOString(),
      p_tickets: Array.from({ length: row?.quantity ?? 0 }, () => ({
        checkout_id: row?.id,
        ticket_type_id: row?.ticket_type_id,
        ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
        qr_public_id: "test/qr",
        qr_version: "1",
      })),
    } as unknown as Args<"issue_tickets_for_checkout">);
    expect(sneaky.error?.message).toMatch(/Payment not verified/);
    await service
      .from("payment_attempt")
      .update({ status: "cancelled" })
      .eq("checkout_session_id", p.checkout_session_id);

    // One open plan per person and event.
    const again = await startTicketPlanCore(buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
    });
    expect(again).toMatchObject({ status: 409, planId: p.id });

    const cancelled = await cancelTicketPlanCore(buyer.id, p.id);
    expect(cancelled.status).toBe(200);
    const { data: leftAfter } = await service.rpc(
      "event_shared_capacity_left",
      { p_event_id: eventId },
    );
    expect(leftAfter).toBe(3);
  });

  it("records the parts, and the last part issues the tickets as one purchase", async () => {
    const { eventId, ticketTypeId } = await createEvent({
      capacity: 50,
      quantity: 5,
    });
    const started = await startTicketPlanCore(buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 2 },
    });
    if (started.status !== 200) throw new Error("plan not started");
    const planId = started.data.planId;
    expect(await quantityOf(ticketTypeId)).toBe(3);

    // Below the first part's minimum, or more than is left: refused.
    const small = await payTicketPlanPartCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { planId, amountMinor: 4_199, paymentMethodId: methodId },
      () => "https://example.test",
    );
    expect(small.status).toBe(400);
    const big = await payTicketPlanPartCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { planId, amountMinor: 21_001, paymentMethodId: methodId },
      () => "https://example.test",
    );
    expect(big.status).toBe(400);

    const first = await payPart(planId, 10_500);
    expect(first.result.status).toBe("succeeded");
    let p = await plan(planId);
    expect(p.status).toBe("active");
    expect(Number(p.paid_minor)).toBe(10_500);

    // A replay of the same part (a webhook redelivery) changes nothing and
    // does not even ask the provider again.
    expect((await finalizePayment(first.attemptId, deps)).status).toBe(
      "succeeded",
    );
    expect(paystack.verifyTransaction).toHaveBeenCalledTimes(1);
    expect(Number((await plan(planId)).paid_minor)).toBe(10_500);

    const last = await payPart(planId, 10_500);
    expect(last.result.status).toBe("succeeded");
    p = await plan(planId);
    expect(p.status).toBe("completed");
    expect(p.transaction_id).toBeTruthy();

    const { data: txn } = await service
      .from("transaction")
      .select("provider, amount, status, provider_fee")
      .eq("id", p.transaction_id as string)
      .single();
    expect(txn).toMatchObject({
      provider: "abonten_plan",
      amount: 210,
      status: "successful",
      provider_fee: 3,
    });
    const { count: tickets } = await service
      .from("ticket")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", p.transaction_id as string);
    expect(tickets).toBe(2);
    const { data: earning } = await service
      .from("organizer_ledger_entry")
      .select("amount")
      .eq("entry_type", "earning")
      .eq("transaction_id", p.transaction_id as string);
    expect(earning?.map((e) => Number(e.amount))).toEqual([200]);
    const { data: fee } = await service
      .from("platform_fee_entry")
      .select("service_fee, ticket_revenue")
      .eq("transaction_id", p.transaction_id as string)
      .eq("entry_type", "fee")
      .single();
    expect(fee).toMatchObject({ service_fee: 10, ticket_revenue: 200 });

    // Refunding the purchase goes back through both parts' charges: the
    // ticket revenue (200.00), the fee kept, half on each part.
    // As Admin › Finance refunds an order: its tickets are cancelled first.
    await cancelTicketsForTransactionCore(p.transaction_id as string);
    const refund = await issueRefundCore(service, p.transaction_id as string);
    expect(refund.status).toBe(200);
    const amounts = paystack.refundTransaction.mock.calls
      .map((c) => c[2])
      .sort();
    expect(amounts).toEqual([10_000, 10_000]);
    const { data: pending } = await service
      .from("transaction")
      .select("status")
      .eq("id", p.transaction_id as string)
      .single();
    expect(pending?.status).toBe("refund_pending");

    for (const ref of [first.reference, last.reference]) {
      expect(
        await handlePlanPartRefundOutcome({
          provider: "paystack",
          reference: ref,
          providerTransactionId: null,
          outcome: "processed",
          detail: null,
        }),
      ).toBe("matched");
    }
    const { data: refunded } = await service
      .from("transaction")
      .select("status")
      .eq("id", p.transaction_id as string)
      .single();
    expect(refunded?.status).toBe("refunded");
    expect((await plan(planId)).refund_status).toBe("refunded");
  });

  it("ends a plan at its deadline, puts the seats back and refunds through each part, keeping the fee share", async () => {
    const { eventId, ticketTypeId } = await createEvent({
      capacity: 50,
      quantity: 5,
    });
    const started = await startTicketPlanCore(buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 2 },
    });
    if (started.status !== 200) throw new Error("plan not started");
    const planId = started.data.planId;
    const a = await payPart(planId, 4_200);
    const b = await payPart(planId, 2_101);
    expect(a.result.status).toBe("succeeded");
    expect(b.result.status).toBe("succeeded");

    await service
      .from("ticket_plan")
      .update({ deadline_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", planId);
    const summary = await runTicketPlanMaintenanceCore(deps);
    expect(summary.lapsed).toBeGreaterThanOrEqual(1);

    const p = await plan(planId);
    expect(p.status).toBe("lapsed");
    expect(p.ended_reason).toBe("deadline");
    // 63.01 paid: 60.00 is the ticket share, 3.01 the fee share kept.
    expect(Number(p.refund_minor)).toBe(6_000);
    expect(Number(p.kept_minor)).toBe(301);
    expect(await quantityOf(ticketTypeId)).toBe(5);

    const { data: parts } = await service
      .from("ticket_plan_payment")
      .select("provider_reference, amount_minor, refund_minor, refund_status")
      .eq("plan_id", planId)
      .order("amount_minor", { ascending: false });
    expect(parts?.map((r) => Number(r.refund_minor))).toEqual([3_999, 2_001]);
    expect(parts?.every((r) => r.refund_status === "requested")).toBe(true);
    expect(
      paystack.refundTransaction.mock.calls.map((c) => c[2]).sort(),
    ).toEqual([2_001, 3_999]);

    // The provider refuses one share: staff are told, then retry it.
    await handlePlanPartRefundOutcome({
      provider: "paystack",
      reference: parts?.[0].provider_reference as string,
      providerTransactionId: null,
      outcome: "processed",
      detail: null,
    });
    await handlePlanPartRefundOutcome({
      provider: "paystack",
      reference: parts?.[1].provider_reference as string,
      providerTransactionId: null,
      outcome: "failed",
      detail: "Wallet closed",
    });
    expect((await plan(planId)).refund_status).toBe("failed");
    const { data: failedPart } = await service
      .from("ticket_plan_payment")
      .select("id")
      .eq("provider_reference", parts?.[1].provider_reference as string)
      .single();
    const { data: marked } = await service.rpc(
      "ticket_plan_admin_part_refund",
      {
        p_payment_id: failedPart?.id as string,
        p_action: "mark_done",
        p_note: "Sent by MoMo by hand",
      },
    );
    expect(marked).toMatchObject({ changed: true, refund_status: "refunded" });

    // A plan that has ended takes no more parts.
    const late = await payTicketPlanPartCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { planId, amountMinor: 2_100, paymentMethodId: methodId },
      () => "https://example.test",
    );
    expect(late.status).toBe(409);
  });

  it("refunds in full a payment that arrives after its plan ended", async () => {
    const { eventId, ticketTypeId } = await createEvent({
      capacity: 50,
      quantity: null,
    });
    const started = await startTicketPlanCore(buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
    });
    if (started.status !== 200) throw new Error("plan not started");
    const planId = started.data.planId;
    const charge = await payTicketPlanPartCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { planId, amountMinor: 2_100, paymentMethodId: methodId },
      () => "https://example.test",
    );
    if (charge.status !== 200) throw new Error("part not started");

    // The hold runs out while the buyer is still on the payment page.
    await service
      .from("ticket_plan")
      .update({
        hold_expires_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      })
      .eq("id", planId);
    await runTicketPlanMaintenanceCore(deps);
    expect((await plan(planId)).status).toBe("expired");

    paystack.verifyTransaction.mockResolvedValueOnce({
      id: 99,
      status: "success",
      reference: charge.data.payment.reference,
      amount: 2_100,
      currency: "GHS",
      customer: { email: buyer.email },
    });
    const late = await finalizePayment(charge.data.attemptId, deps);
    expect(late.status).toBe("failed");
    expect(paystack.refundTransaction).toHaveBeenCalledWith(
      expect.anything(),
      charge.data.payment.reference,
      null,
    );
    const { count } = await service
      .from("ticket_plan_payment")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", planId);
    expect(count).toBe(0);
  });

  it("ends the plans on an event the organizer cancels", async () => {
    const { eventId, ticketTypeId } = await createEvent({
      capacity: 50,
      quantity: null,
    });
    const started = await startTicketPlanCore(buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
    });
    if (started.status !== 200) throw new Error("plan not started");
    const part = await payPart(started.data.planId, 2_100);
    expect(part.result.status).toBe("succeeded");

    const cancelled = await cancelEventCore(organizer.client, eventId);
    expect(cancelled.status).toBe(200);
    const p = await plan(started.data.planId);
    expect(p.status).toBe("cancelled");
    expect(p.ended_reason).toBe("event_cancelled");
    expect(Number(p.refund_minor)).toBe(2_000);

    const detail = await getTicketPlanCore(buyer.id, started.data.planId);
    expect(detail.status === 200 && detail.data.nextPart).toBeNull();
  });

  it("keeps every plan table and function away from the apps", async () => {
    for (const table of [
      "ticket_plan",
      "ticket_plan_payment",
      "ticket_plan_program_setting",
      "event_ticket_plan_setting",
    ] as const) {
      const { data, error } = await buyer.client.from(table).select("*");
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
    const release = await buyer.client.rpc("ticket_plan_release", {
      p_plan_id: crypto.randomUUID(),
      p_status: "cancelled",
      p_reason: "buyer",
    });
    expect(release.error?.code).toBe("42501");
    const record = await buyer.client.rpc("ticket_plan_record_payment", {
      p_attempt_id: crypto.randomUUID(),
      p_amount_minor: 1,
      p_provider_fee_minor: 0,
      p_provider_transaction_id: "x",
    });
    expect(record.error?.code).toBe("42501");
    const created = await buyer.client
      .from("event_ticket_plan_setting")
      .insert({ event_id: crypto.randomUUID(), enabled: true });
    expect(created.error).not.toBeNull();
  });
});
