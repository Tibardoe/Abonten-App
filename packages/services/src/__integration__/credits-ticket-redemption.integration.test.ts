import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Paying for tickets with Abonten Credit (migration credit_ticket_redemption)
// through the real payment path -- createMultiCheckoutPaymentAttemptCore,
// finalizePaystackPayment, issueRefundCore, cancel_event_and_release_tickets
// and the payout review. Only Paystack's HTTP calls are replaced (vi.mock
// below); everything else runs against real Postgres.
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
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { issueRefundCore } from "../organizer/issueRefundCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePaystackPayment } from "../payments/finalizePaystackPayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const paystack = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  initializeTransaction: vi.fn(),
  refundTransaction: vi.fn(),
}));

vi.mock("../payments/gateway/paystackService", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyTransaction: paystack.verifyTransaction,
  initializeTransaction: paystack.initializeTransaction,
  refundTransaction: paystack.refundTransaction,
}));

type SettingsRow =
  Database["public"]["Tables"]["reward_program_setting"]["Row"];
type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];

// Two GH₵ 50 tickets + the 5% service fee = GH₵ 105.
const ORDER_TOTAL_MINOR = 10_500;
const TICKET_REVENUE_MINOR = 10_000;

const key = (label: string) => `test:${label}:${crypto.randomUUID()}`;

async function expectLedgerHealthy(service: SupabaseClient<Database>) {
  const { data, error } = await service.rpc("credit_reconciliation_checks");
  expect(error).toBeNull();
  expect(data).toEqual({
    credit_unbalanced_journals: 0,
    credit_balance_cache_drift: 0,
    credit_lot_bucket_drift: 0,
    credit_lot_invalid_state: 0,
    credit_reservation_stuck: 0,
    credit_capture_mismatch: 0,
  });
}

describe("paying for tickets with credit", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let originalSettings: SettingsRow;
  let paymentMethodId: string;
  const eventIds: string[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  // The web app injects generateTicket; this stand-in issues the tickets
  // through the same RPC (service role), without the QR upload.
  const deps: PaymentFulfillmentDeps = {
    issueTickets: async (sessionId, transactionId, metadata, auth) => {
      const { data: rows } = await service
        .from("ticket_checkout")
        .select("id, ticket_type_id, quantity, status")
        .eq("checkout_session_id", sessionId)
        .eq("user_id", auth.userId);
      if ((rows ?? []).every((r) => r.status === "paid")) {
        return { status: 200 };
      }
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
        p_ticket_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        p_tickets: tickets,
      } as unknown as Args<"issue_tickets_for_checkout">);
      return error ? { status: 500, message: error.message } : { status: 200 };
    },
    activatePlacePromotion: async () => ({ status: 500, message: "not used" }),
    activateEventPromotion: async () => ({ status: 500, message: "not used" }),
  };

  async function setSettings(patch: Partial<SettingsRow>) {
    const { error } = await service
      .from("reward_program_setting")
      .update(patch)
      .eq("id", 1);
    expect(error).toBeNull();
  }

  async function setBalance(user: TestUser, minor: number) {
    const { data } = await service.rpc("credit_spendable", {
      p_user_id: user.id,
      p_scope: "tickets",
    });
    const have = Number(
      (data as { spendable_minor?: number } | null)?.spendable_minor ?? 0,
    );
    if (have < minor) {
      await service.rpc("credit_grant", {
        p_user_id: user.id,
        p_amount_minor: minor - have,
        p_journal_type: "bonus.grant",
        p_lot_kind: "bonus",
        p_spend_scope: "any",
        p_idempotency_key: key("grant"),
        p_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      });
    } else if (have > minor) {
      await service.rpc("credit_debit_available", {
        p_user_id: user.id,
        p_amount_minor: have - minor,
        p_journal_type: "adjust.debit",
        p_idempotency_key: key("trim"),
      });
    }
  }

  async function newEvent(ownerId = organizer.id) {
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      ownerId,
      { quantity: 20, price: 50 },
    );
    eventIds.push(eventId);
    return { eventId, ticketTypeId };
  }

  async function openCheckout(user: TestUser, eventId: string, typeId: string) {
    const res = await validateCheckoutCore(user.client, user.id, {
      eventId,
      quantities: { [typeId]: 2 },
    });
    expect(res.status).toBe(200);
    return res.checkoutSessionId as string;
  }

  const pay = (
    user: TestUser,
    sessionId: string,
    opts: { useCredit: boolean; paymentMethodId?: string | null },
  ) =>
    createMultiCheckoutPaymentAttemptCore(
      user.client,
      user.id,
      user.email,
      { checkoutSessionIds: [sessionId], ...opts },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );

  async function transactionOf(attemptId: string) {
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("transaction_id")
      .eq("id", attemptId)
      .single();
    const { data: txn } = await service
      .from("transaction")
      .select(
        "id, amount, credit_amount, credit_refunded_amount, payment_method, status",
      )
      .eq("id", attempt?.transaction_id as string)
      .single();
    return txn;
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    const { data } = await service
      .from("reward_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    originalSettings = data as SettingsRow;
    await setSettings({
      rewards_enabled: true,
      audience: "all",
      redeem_tickets_enabled: true,
      allow_full_credit_ticket_orders: false,
      max_credit_share_of_ticket_order_bps: 10000,
      min_cash_charge_minor: 100,
    });
    const { data: method, error } = await service
      .from("payment_method")
      .insert({
        user_id: buyer.id,
        method_type: "card",
        details: { brand: "visa", last4: "4081" },
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    paymentMethodId = method?.id as string;
  });

  afterAll(async () => {
    await setSettings({
      rewards_enabled: originalSettings.rewards_enabled,
      audience: originalSettings.audience,
      redeem_tickets_enabled: originalSettings.redeem_tickets_enabled,
      allow_full_credit_ticket_orders:
        originalSettings.allow_full_credit_ticket_orders,
      max_credit_share_of_ticket_order_bps:
        originalSettings.max_credit_share_of_ticket_order_bps,
      min_cash_charge_minor: originalSettings.min_cash_charge_minor,
    });
    await service.from("payment_method").delete().eq("id", paymentMethodId);
    await Promise.all(
      [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
    paystack.initializeTransaction.mockReset();
    paystack.refundTransaction.mockReset();
    paystack.initializeTransaction.mockImplementation(
      async (p: { reference: string }) => ({
        reference: p.reference,
        access_code: "test-access",
        authorization_url: "https://checkout.paystack.test/x",
      }),
    );
    paystack.refundTransaction.mockResolvedValue({ status: "pending" });
  });

  afterEach(async () => {
    await expectLedgerHealthy(service);
  });

  it("quotes part credit, keeps the minimum cash charge, and never on your own event", async () => {
    const { eventId, ticketTypeId } = await newEvent();
    await setBalance(buyer, 50_000);
    const sessionId = await openCheckout(buyer, eventId, ticketTypeId);

    // Full-credit orders are off: credit stops GH₵ 1 short of the total.
    const res = await pay(buyer, sessionId, { useCredit: true });
    expect(res.status).toBe(400);
    if (res.status === 400) expect(res.message).toMatch(/payment method/i);

    const { data: own } = await createTestEventWithTicketType(
      service,
      buyer.id,
      { quantity: 5, price: 50 },
    ).then(async (e) => {
      eventIds.push(e.eventId);
      return { data: e };
    });
    const ownSession = await openCheckout(buyer, own.eventId, own.ticketTypeId);
    const ownRes = await pay(buyer, ownSession, {
      useCredit: true,
      paymentMethodId,
    });
    expect(ownRes.status).toBe(409);
    if (ownRes.status === 409) expect(ownRes.message).toMatch(/your own event/);
  });

  it("pays a whole ticket order with credit when the program allows it", async () => {
    await setSettings({ allow_full_credit_ticket_orders: true });
    const { eventId, ticketTypeId } = await newEvent();
    await setBalance(buyer, 20_000);
    const sessionId = await openCheckout(buyer, eventId, ticketTypeId);

    const res = await pay(buyer, sessionId, { useCredit: true });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.data.paystack).toBeNull();
    expect(res.data.credit).toEqual({
      appliedMinor: ORDER_TOTAL_MINOR,
      cashMinor: 0,
    });
    expect(res.data.verification?.status).toBe(200);
    expect(paystack.verifyTransaction).not.toHaveBeenCalled();

    const txn = await transactionOf(res.data.attempts[0].id);
    expect(txn).toMatchObject({
      amount: 0,
      credit_amount: 105,
      payment_method: "abonten_credit",
      status: "successful",
    });
    const { count: tickets } = await service
      .from("ticket")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", txn?.id as string);
    expect(tickets).toBe(2);

    // The organizer still earns the full ticket price, and Abonten's fee is
    // recorded on what the customer paid in total (cash + credit).
    const { data: fee } = await service
      .from("platform_fee_entry")
      .select("ticket_revenue, service_fee, credit_applied")
      .eq("transaction_id", txn?.id as string)
      .eq("entry_type", "fee")
      .single();
    expect(fee).toEqual({
      ticket_revenue: 100,
      service_fee: 5,
      credit_applied: 105,
    });
    const { data: earning } = await service
      .from("organizer_ledger_entry")
      .select("amount")
      .eq("event_id", eventId)
      .eq("entry_type", "earning");
    expect(earning?.reduce((s, r) => s + Number(r.amount), 0)).toBe(100);

    // Refunded entirely to credit, at once, without touching Paystack.
    const refund = await issueRefundCore(service, txn?.id as string);
    expect(refund.status).toBe(200);
    expect(paystack.refundTransaction).not.toHaveBeenCalled();
    const after = await transactionOf(res.data.attempts[0].id);
    expect(after).toMatchObject({
      status: "refunded",
      credit_refunded_amount: 100,
    });
    const { data: refundLot } = await service
      .from("credit_lot")
      .select("kind, remaining_minor, status")
      .eq("source_id", txn?.id as string)
      .single();
    expect(refundLot).toEqual({
      kind: "refund",
      remaining_minor: TICKET_REVENUE_MINOR,
      status: "active",
    });

    await setSettings({ allow_full_credit_ticket_orders: false });
  });

  it("charges Paystack only the cash part, then splits the refund by tender", async () => {
    const { eventId, ticketTypeId } = await newEvent();
    await setBalance(buyer, 3000);
    const sessionId = await openCheckout(buyer, eventId, ticketTypeId);

    const res = await pay(buyer, sessionId, {
      useCredit: true,
      paymentMethodId,
    });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.data.credit).toEqual({ appliedMinor: 3000, cashMinor: 7500 });
    expect(paystack.initializeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amountInPesewas: 7500 }),
    );
    const reference = res.data.paystack?.reference as string;

    paystack.verifyTransaction.mockResolvedValueOnce({
      id: 1,
      status: "success",
      reference,
      amount: 7500,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 146,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: buyer.email },
    });
    const done = await finalizePaystackPayment(res.data.attempts[0].id, deps);
    expect(done.status).toBe("succeeded");

    const txn = await transactionOf(res.data.attempts[0].id);
    expect(txn).toMatchObject({
      amount: 75,
      credit_amount: 30,
      payment_method: "paystack+credit",
    });
    const { data: fee } = await service
      .from("platform_fee_entry")
      .select("service_fee, credit_applied, net_revenue")
      .eq("transaction_id", txn?.id as string)
      .eq("entry_type", "fee")
      .single();
    expect(fee).toEqual({
      service_fee: 5,
      credit_applied: 30,
      net_revenue: 3.54,
    });

    // Refund GH₵ 100 of ticket revenue: 30/105 of it back as credit, the
    // rest through Paystack. The service fee is retained.
    await setBalance(buyer, 0);
    const refund = await issueRefundCore(service, txn?.id as string);
    expect(refund.status).toBe(200);
    expect(paystack.refundTransaction).toHaveBeenCalledWith(reference, 7143);
    const after = await transactionOf(res.data.attempts[0].id);
    expect(after).toMatchObject({
      status: "refund_pending",
      credit_refunded_amount: 28.57,
    });
    const { data: summary } = await service
      .from("credit_account")
      .select("available_minor")
      .eq("user_id", buyer.id)
      .single();
    expect(summary?.available_minor).toBe(2857);

    // A retry changes nothing.
    const again = await issueRefundCore(service, txn?.id as string);
    expect(again.status).toBe(200);
    expect(paystack.refundTransaction).toHaveBeenCalledTimes(1);
    const { data: journals } = await service
      .from("credit_journal")
      .select("id")
      .eq("idempotency_key", `redeem.refund:${txn?.id}`);
    expect(journals).toHaveLength(1);
  });

  it("refunds orders paid entirely with credit when the organizer cancels the event", async () => {
    await setSettings({ allow_full_credit_ticket_orders: true });
    const { eventId, ticketTypeId } = await newEvent();
    await setBalance(buyer, 20_000);
    const sessionId = await openCheckout(buyer, eventId, ticketTypeId);
    const res = await pay(buyer, sessionId, { useCredit: true });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    const txn = await transactionOf(res.data.attempts[0].id);

    const { data: refundable, error } = await organizer.client.rpc(
      "cancel_event_and_release_tickets",
      { p_event_id: eventId },
    );
    expect(error).toBeNull();
    expect(refundable).toEqual([
      expect.objectContaining({
        refund_transaction_id: txn?.id,
        transaction_amount: 105,
      }),
    ]);
    await setSettings({ allow_full_credit_ticket_orders: false });
  });

  it("holds a payout when credit paid for a large share of an event's sales", async () => {
    await setSettings({ allow_full_credit_ticket_orders: true });
    const { eventId, ticketTypeId } = await newEvent();
    await setBalance(buyer, 20_000);
    const sessionId = await openCheckout(buyer, eventId, ticketTypeId);
    const res = await pay(buyer, sessionId, { useCredit: true });
    expect(res.status).toBe(200);
    await setSettings({ allow_full_credit_ticket_orders: false });

    // Let the event end and settle (end + 48h).
    const past = Date.now() - 4 * 86_400_000;
    await service
      .from("event")
      .update({
        starts_at: new Date(past).toISOString(),
        ends_at: new Date(past + 3_600_000).toISOString(),
      })
      .eq("id", eventId);

    const { data: account } = await service
      .from("payout_account")
      .insert({
        organizer_id: organizer.id,
        account_type: "mobile_money",
        account_holder_name: "Test Organizer",
        provider: "MTN",
        account_number: "0240000000",
      })
      .select("id")
      .single();

    const { data: created, error: createError } = await service.rpc(
      "admin_create_payout",
      {
        p_organizer_id: organizer.id,
        p_payout_account_id: account?.id as string,
        p_amount: 50,
        p_currency: "GHS",
      },
    );
    expect(createError).toBeNull();
    const payoutId = (created as { payout_id: string }[])[0].payout_id;

    const { data: payout } = await service
      .from("payout")
      .select("review_status, review_details")
      .eq("id", payoutId)
      .single();
    expect(payout?.review_status).toBe("required");
    expect(
      (payout?.review_details as { events: { event_id: string }[] }).events,
    ).toEqual([
      expect.objectContaining({ event_id: eventId, share_bps: 10000 }),
    ]);

    const blocked = await service.rpc("admin_settle_payout", {
      p_payout_id: payoutId,
      p_status: "completed",
    });
    expect(blocked.error?.code).toBe("55000");

    const cleared = await service.rpc("admin_clear_payout_review", {
      p_payout_id: payoutId,
      p_admin_id: organizer.id,
      p_note: "Checked: buyers are unrelated to the organizer.",
    });
    expect(cleared.error).toBeNull();
    const settled = await service.rpc("admin_settle_payout", {
      p_payout_id: payoutId,
      p_status: "completed",
    });
    expect(settled.error).toBeNull();

    // The cleared event isn't flagged again on the next payout.
    const { data: next } = await service.rpc("admin_create_payout", {
      p_organizer_id: organizer.id,
      p_payout_account_id: account?.id as string,
      p_amount: 10,
      p_currency: "GHS",
    });
    const nextId = (next as { payout_id: string }[])[0].payout_id;
    const { data: nextRow } = await service
      .from("payout")
      .select("review_status")
      .eq("id", nextId)
      .single();
    expect(nextRow?.review_status).toBe("none");

    await service
      .from("organizer_ledger_entry")
      .delete()
      .in("payout_id", [payoutId, nextId]);
    await service.from("payout").delete().in("id", [payoutId, nextId]);
    await service
      .from("payout_account")
      .delete()
      .eq("id", account?.id as string);
  });

  it("refuses credit it can't reserve and leaves no open attempt behind", async () => {
    const { eventId, ticketTypeId } = await newEvent();
    await setBalance(buyer, 0);
    const sessionId = await openCheckout(buyer, eventId, ticketTypeId);
    const res = await pay(buyer, sessionId, {
      useCredit: true,
      paymentMethodId,
    });
    expect(res.status).toBe(409);
    const { count } = await service
      .from("payment_attempt")
      .select("id", { count: "exact", head: true })
      .eq("checkout_session_id", sessionId)
      .in("status", ["initiated", "pending"]);
    expect(count).toBe(0);
  });
});
