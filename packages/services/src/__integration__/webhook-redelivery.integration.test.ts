import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// The Paystack webhook's promise: 200 means "never redeliver this", 503 means
// "try again". This suite proves the half of that contract that lives below
// the HTTP handler -- that a redelivery, a concurrent duplicate delivery, and
// a retry after a fulfilment failure all run through finalizePaystackPayment
// without a second ticket, a second organizer earning, a second fee entry or
// a second transaction row. Only Paystack's HTTP calls are replaced (vi.mock
// below); the lock, the RPCs and every table are the real ones.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePaystackPayment } from "../payments/finalizePaystackPayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import {
  WEBHOOK_ACK_OK,
  WEBHOOK_ACK_RETRY,
  paystackWebhookAckStatus,
} from "../payments/webhookAck";
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

type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];

// Two GH₵ 50 tickets + the 5% service fee = GH₵ 105.
const ORDER_TOTAL_MINOR = 10_500;
const TICKETS_PER_ORDER = 2;

describe("webhook redelivery: finalisation is idempotent below the HTTP layer", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  // A saved card with no stored authorisation: the cash path then goes
  // through Paystack's popup initialisation (mocked below), like a real
  // first-time buyer.
  let paymentMethodId: string;
  // Flip to make the next issuance fail the way a Cloudinary/email outage
  // would, after the money has already been confirmed.
  let failNextIssuance = false;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  const deps: PaymentFulfillmentDeps = {
    issueTickets: async (sessionId, transactionId, metadata, auth) => {
      if (failNextIssuance) {
        failNextIssuance = false;
        return { status: 500, message: "simulated QR upload outage" };
      }
      const { data: rows } = await service
        .from("ticket_checkout")
        .select("id, ticket_type_id, quantity, status")
        .eq("checkout_session_id", sessionId)
        .eq("user_id", auth.userId);
      const tickets = (rows ?? []).flatMap((r) =>
        Array.from({ length: r.quantity }, () => ({
          checkout_id: r.id,
          ticket_type_id: r.ticket_type_id,
          ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
          qr_public_id: "test/qr",
          qr_version: "1",
        })),
      );
      // Deliberately NOT short-circuiting on an already-paid session: the
      // RPC itself must be the thing that refuses to issue twice.
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

  async function openAndPay(): Promise<{
    attemptId: string;
    reference: string;
  }> {
    // One pending checkout per buyer and event: retire the previous one.
    await service
      .from("ticket_checkout")
      .update({ status: "cancelled" })
      .eq("user_id", buyer.id)
      .eq("status", "pending");
    const opened = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: TICKETS_PER_ORDER },
    });
    expect(opened.status).toBe(200);
    const paid = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      {
        checkoutSessionIds: [opened.checkoutSessionId as string],
        useCredit: false,
        paymentMethodId,
      },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(paid.status).toBe(200);
    if (paid.status !== 200) throw new Error("payment attempt not created");
    const attemptId = paid.data.attempts[0].id;
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("provider_reference")
      .eq("id", attemptId)
      .single();
    return { attemptId, reference: attempt?.provider_reference as string };
  }

  function paystackSaysPaid(reference: string) {
    paystack.verifyTransaction.mockResolvedValue({
      id: 1,
      status: "success",
      reference,
      amount: ORDER_TOTAL_MINOR,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 200,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: buyer.email },
    });
  }

  async function financialFootprint(attemptId: string) {
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("status, transaction_id, checkout_session_id, provider_reference")
      .eq("id", attemptId)
      .single();
    const txnId = attempt?.transaction_id ?? null;
    const [{ count: tickets }, { count: transactions }, { count: fees }] =
      await Promise.all([
        service
          .from("ticket")
          .select("id", { count: "exact", head: true })
          .eq(
            "transaction_id",
            txnId ?? "00000000-0000-0000-0000-000000000000",
          ),
        service
          .from("transaction")
          .select("id", { count: "exact", head: true })
          .eq("paystack_reference", attempt?.provider_reference as string),
        service
          .from("platform_fee_entry")
          .select("id", { count: "exact", head: true })
          .eq("transaction_id", txnId ?? "00000000-0000-0000-0000-000000000000")
          .eq("entry_type", "fee"),
      ]);
    const { data: rows } = await service
      .from("ticket_checkout")
      .select("id, status")
      .eq("checkout_session_id", attempt?.checkout_session_id as string);
    const { count: earnings } = await service
      .from("organizer_ledger_entry")
      .select("id", { count: "exact", head: true })
      .in(
        "ticket_checkout_id",
        (rows ?? []).map((r) => r.id),
      )
      .eq("entry_type", "earning");
    return {
      attemptStatus: attempt?.status,
      transactionId: txnId,
      tickets: tickets ?? 0,
      transactions: transactions ?? 0,
      fees: fees ?? 0,
      earnings: earnings ?? 0,
      checkoutStatuses: [...new Set((rows ?? []).map((r) => r.status))],
    };
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
      { quantity: 50, price: 50 },
    ));
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
    await service.from("payment_method").delete().eq("id", paymentMethodId);
    await Promise.all(
      [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  beforeEach(() => {
    failNextIssuance = false;
    paystack.verifyTransaction.mockReset();
    paystack.initializeTransaction.mockReset();
    paystack.initializeTransaction.mockImplementation(
      async (p: { reference: string }) => ({
        reference: p.reference,
        access_code: "test-access",
        authorization_url: "https://checkout.paystack.test/x",
      }),
    );
  });

  it("two deliveries of the same charge.success at once: one fulfils, the other is refused by the lock, nothing is doubled", async () => {
    const { attemptId, reference } = await openAndPay();
    paystackSaysPaid(reference);

    const [a, b] = await Promise.all([
      finalizePaystackPayment(attemptId, deps),
      finalizePaystackPayment(attemptId, deps),
    ]);
    const statuses = [a.status, b.status].sort();
    // Whichever caller loses the compare-and-set sees 'already_processing'
    // (or, if it ran after the winner finished, 'succeeded'); neither path
    // fulfils twice.
    expect(statuses).toContain("succeeded");
    for (const s of statuses) {
      expect(["succeeded", "already_processing"]).toContain(s);
    }
    // The loser answers 503 so Paystack comes back and then gets a 200 from
    // the finished state -- never a 200 for work it did not do.
    expect(paystackWebhookAckStatus(a)).toBe(
      a.status === "succeeded" ? WEBHOOK_ACK_OK : WEBHOOK_ACK_RETRY,
    );

    expect(await financialFootprint(attemptId)).toMatchObject({
      attemptStatus: "succeeded",
      tickets: TICKETS_PER_ORDER,
      transactions: 1,
      fees: 1,
      earnings: 1,
      checkoutStatuses: ["paid"],
    });
    // Only the winner talked to Paystack.
    expect(paystack.verifyTransaction).toHaveBeenCalledTimes(1);
  });

  it("issuance fails after the money is confirmed: 503, then the redelivery finishes the order without a second ticket, earning or fee", async () => {
    const { attemptId, reference } = await openAndPay();
    paystackSaysPaid(reference);

    failNextIssuance = true;
    const first = await finalizePaystackPayment(attemptId, deps);
    expect(first.status).toBe("fulfillment_failed");
    expect(paystackWebhookAckStatus(first)).toBe(WEBHOOK_ACK_RETRY);
    // The charge is recorded (so a retry can never re-charge), nothing is
    // issued, and the checkout is still open for the retry.
    const afterFailure = await financialFootprint(attemptId);
    expect(afterFailure).toMatchObject({
      attemptStatus: "fulfillment_failed",
      tickets: 0,
      transactions: 1,
      fees: 0,
      earnings: 0,
      checkoutStatuses: ["pending"],
    });
    expect(afterFailure.transactionId).not.toBeNull();

    // Paystack redelivers.
    const second = await finalizePaystackPayment(attemptId, deps);
    expect(second.status).toBe("succeeded");
    expect(paystackWebhookAckStatus(second)).toBe(WEBHOOK_ACK_OK);
    const afterRetry = await financialFootprint(attemptId);
    expect(afterRetry).toMatchObject({
      attemptStatus: "succeeded",
      tickets: TICKETS_PER_ORDER,
      transactions: 1,
      fees: 1,
      earnings: 1,
      checkoutStatuses: ["paid"],
    });
    expect(afterRetry.transactionId).toBe(afterFailure.transactionId);

    // A third delivery of the same event (a late duplicate) is a no-op that
    // does not even re-verify.
    paystack.verifyTransaction.mockClear();
    const third = await finalizePaystackPayment(attemptId, deps);
    expect(third.status).toBe("succeeded");
    expect(paystack.verifyTransaction).not.toHaveBeenCalled();
    expect(await financialFootprint(attemptId)).toMatchObject({
      tickets: TICKETS_PER_ORDER,
      transactions: 1,
      fees: 1,
      earnings: 1,
    });
  });

  it("Paystack's verify endpoint is unreachable: 503, the attempt stays retryable, and the redelivery succeeds", async () => {
    const { attemptId, reference } = await openAndPay();
    paystack.verifyTransaction.mockRejectedValueOnce(
      new Error("simulated Paystack time-out"),
    );

    const outage = await finalizePaystackPayment(attemptId, deps);
    expect(outage.status).toBe("pending");
    expect(paystackWebhookAckStatus(outage)).toBe(WEBHOOK_ACK_RETRY);
    expect(await financialFootprint(attemptId)).toMatchObject({
      attemptStatus: "pending",
      tickets: 0,
      transactions: 0,
      checkoutStatuses: ["pending"],
    });

    paystackSaysPaid(reference);
    const redelivered = await finalizePaystackPayment(attemptId, deps);
    expect(redelivered.status).toBe("succeeded");
    expect(await financialFootprint(attemptId)).toMatchObject({
      attemptStatus: "succeeded",
      tickets: TICKETS_PER_ORDER,
      transactions: 1,
      fees: 1,
      earnings: 1,
      checkoutStatuses: ["paid"],
    });
  });

  it("the ticket RPC itself refuses to issue a paid session twice, even when called directly with a fresh ticket list", async () => {
    const { attemptId, reference } = await openAndPay();
    paystackSaysPaid(reference);
    expect((await finalizePaystackPayment(attemptId, deps)).status).toBe(
      "succeeded",
    );
    const before = await financialFootprint(attemptId);

    // Bypass finalize's lock entirely and hit the database function the way
    // a buggy caller would: it must hand back the existing tickets, flagged
    // already_issued, and insert nothing.
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("checkout_session_id, transaction_id")
      .eq("id", attemptId)
      .single();
    const { data: issued, error } = await service.rpc(
      "issue_tickets_for_checkout",
      {
        p_checkout_session_id: attempt?.checkout_session_id,
        p_user_id: buyer.id,
        p_transaction_id: attempt?.transaction_id,
        p_metadata: {},
        p_ticket_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        p_tickets: Array.from({ length: TICKETS_PER_ORDER }, () => ({
          checkout_id: crypto.randomUUID(),
          ticket_type_id: ticketTypeId,
          ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
          qr_public_id: "test/qr",
          qr_version: "1",
        })),
      } as unknown as Args<"issue_tickets_for_checkout">,
    );
    expect(error).toBeNull();
    const rows = (issued ?? []) as {
      ticket_id: string;
      already_issued: boolean;
    }[];
    expect(rows).toHaveLength(TICKETS_PER_ORDER);
    expect(rows.every((r) => r.already_issued)).toBe(true);
    expect(await financialFootprint(attemptId)).toEqual(before);
  });
});
