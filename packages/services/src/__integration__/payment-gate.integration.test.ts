import { createHmac } from "node:crypto";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25): the payment paths that go wrong in real life
// — interrupted, repeated, concurrent, late — run end to end against the
// database with Paystack replaced by an in-memory double, so every amount,
// reference and outcome can be asserted. What each case must prove is in
// its name. The normal path against Paystack's real test API is the
// paystack-sandbox suite.
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
import { listRefundPartsCore } from "../admin/finance/financeAdminCore";
import { cancelTicketCheckoutSessionCore } from "../checkout/cancelTicketCheckoutSessionCore";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { invalidateMarketCache } from "../markets/marketConfig";
import { issueRefundCore } from "../organizer/issueRefundCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { paystackProvider } from "../payments/providers/paystackProvider";
import type {
  CheckoutInit,
  VerificationResult,
} from "../payments/providers/types";
import { verifyPaymentCore } from "../payments/verifyPaymentCore";
import { handleProviderWebhook } from "../payments/webhookCore";
import {
  cancelEventTicketsCore,
  eventCancelQuoteCore,
} from "../tickets/cancelEventTicketsCore";
import { cancelUserTicketCore } from "../tickets/cancelUserTicketCore";
import { ticketCancelQuoteCore } from "../tickets/ticketCancelQuoteCore";
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

const KEY = "sk_test_payment_gate";

/** Paystack as a test double: what was opened, paid, verified, refunded. */
function fakePaystack() {
  const opened = new Map<string, number>();
  const paid = new Set<string>();
  const reportCurrency = new Map<string, string>();
  const refunds: string[] = [];
  const refundAmounts: (number | null)[] = [];
  let refundFailures = 0;
  let verifyFailures = 0;
  const init = async (
    _account: unknown,
    input: { reference: string; amount: { amountMinor: number } },
  ): Promise<CheckoutInit> => {
    opened.set(input.reference, input.amount.amountMinor);
    return {
      mode: "popup",
      provider: "paystack",
      reference: input.reference,
      accessCode: `ac_${input.reference}`,
      authorizationUrl: `https://checkout.example/${input.reference}`,
      publicKey: null,
    };
  };
  vi.spyOn(paystackProvider, "initializeCheckout").mockImplementation(init);
  vi.spyOn(paystackProvider, "verify").mockImplementation(
    async (_account, reference): Promise<VerificationResult> => {
      if (verifyFailures > 0) {
        verifyFailures -= 1;
        throw new Error("simulated Paystack time-out");
      }
      return {
        status: paid.has(reference) ? "success" : "abandoned",
        reference,
        amount: {
          amountMinor: opened.get(reference) ?? 0,
          currency: reportCurrency.get(reference) ?? "GHS",
        },
        providerTransactionId: `tx_${reference}`,
        providerFee: null,
        channel: "card",
        customerEmail: "buyer@example.com",
        instrument: null,
        detail: null,
        raw: {},
      };
    },
  );
  vi.spyOn(paystackProvider, "refund").mockImplementation(
    async (_account, input) => {
      if (refundFailures > 0) {
        refundFailures -= 1;
        throw new Error("simulated refund refusal");
      }
      refunds.push(input.reference ?? "");
      refundAmounts.push(input.amount?.amountMinor ?? null);
      return { providerRefundId: `rf-${refunds.length}-${input.reference}` };
    },
  );
  return {
    opened,
    paid,
    reportCurrency,
    refunds,
    refundAmounts,
    failNextVerify: (n = 1) => {
      verifyFailures = n;
    },
    failNextRefund: (n = 1) => {
      refundFailures = n;
    },
  };
}

function signed(event: string, data: Record<string, unknown>) {
  const body = JSON.stringify({ event, data });
  return {
    body,
    headers: new Headers({
      "x-paystack-signature": createHmac("sha512", KEY)
        .update(body)
        .digest("hex"),
    }),
  };
}

describe("payment production gate", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  const users: TestUser[] = [];
  const events: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};

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
          ticket_code: `TKT-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
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
    activatePlacePromotion: async () => ({ status: 500, message: "unused" }),
    activateEventPromotion: async () => ({ status: 500, message: "unused" }),
  };

  beforeAll(async () => {
    service = getServiceClient();
    const { data: acct } = await service
      .from("market_payment_provider")
      .select("secret_key_env, webhook_secret_env")
      .eq("country_code", "GH")
      .eq("provider", "paystack")
      .single();
    for (const name of [
      acct?.secret_key_env as string,
      acct?.webhook_secret_env as string,
    ]) {
      savedEnv[name] = process.env[name];
      process.env[name] = KEY;
    }
    invalidateMarketCache();
    organizer = await createTestUser(service);
    users.push(organizer);
  });

  beforeEach(async () => {
    buyer = await createTestUser(service);
    users.push(buyer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    invalidateMarketCache();
    for (const id of events) {
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  async function newEvent(quantity = 20) {
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity,
      price: 50,
    });
    events.push(fixture.eventId);
    return fixture;
  }

  async function openSession(
    fixture: { eventId: string; ticketTypeId: string },
    who: TestUser = buyer,
  ) {
    const opened = await validateCheckoutCore(who.client, who.id, {
      eventId: fixture.eventId,
      quantities: { [fixture.ticketTypeId]: 1 },
    });
    expect(opened.status, opened.message).toBe(200);
    return opened.checkoutSessionId as string;
  }

  async function pay(sessionIds: string[], method = "card") {
    const started = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { checkoutSessionIds: sessionIds, method, platform: "web" },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(started.status, JSON.stringify(started)).toBe(200);
    if (started.status !== 200) throw new Error("unreachable");
    return started.data;
  }

  async function webhookSuccess(reference: string) {
    const { body, headers } = signed("charge.success", {
      reference,
      id: Math.floor(Math.random() * 1e9),
      status: "success",
    });
    return handleProviderWebhook({
      providerCode: "paystack",
      countryCode: "GH",
      rawBody: body,
      headers,
      deps,
    });
  }

  async function ticketsOf(user: TestUser) {
    const { data } = await service
      .from("ticket")
      .select("id, status, transaction_id")
      .eq("user_id", user.id);
    return data ?? [];
  }

  async function transactionsOf(user: TestUser) {
    const { data } = await service
      .from("transaction")
      .select("id, amount, currency, status, provider_reference")
      .eq("user_id", user.id);
    return data ?? [];
  }

  it("books the right total, fee and organizer earning, once", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    expect(provider.opened.get(ref)).toBe(5250); // GH₵50 + 5% fee
    provider.paid.add(ref);
    expect((await finalizePayment(started.attempts[0].id, deps)).status).toBe(
      "succeeded",
    );
    const [txn] = await transactionsOf(buyer);
    expect(txn).toMatchObject({ amount: 52.5, currency: "GHS" });
    const { data: earning } = await service
      .from("organizer_ledger_entry")
      .select("entry_type, amount, currency")
      .eq("transaction_id", txn.id);
    expect(earning).toEqual([
      { entry_type: "earning", amount: 50, currency: "GHS" },
    ]);
    const { data: fee } = await service
      .from("platform_fee_entry")
      .select("ticket_revenue, service_fee, total_customer_payment, currency")
      .eq("transaction_id", txn.id);
    expect(fee).toEqual([
      {
        ticket_revenue: 50,
        service_fee: 2.5,
        total_customer_payment: 52.5,
        currency: "GHS",
      },
    ]);
  });

  it("success, then the client times out: the webhook finishes it and a late verify changes nothing", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    // The browser never comes back; Paystack's webhook does.
    const hook = await webhookSuccess(ref);
    expect(hook.status).toBe(200);
    // Then the client reconnects and verifies.
    const late = await verifyPaymentCore(
      buyer.client,
      buyer.id,
      started.attempts[0].id,
      deps,
    );
    expect(late.status).toBe(200);
    expect(await ticketsOf(buyer)).toHaveLength(1);
    expect(await transactionsOf(buyer)).toHaveLength(1);
  });

  it("a duplicate and a delayed webhook after the client finished issue nothing more", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    await verifyPaymentCore(
      buyer.client,
      buyer.id,
      started.attempts[0].id,
      deps,
    );
    const { body, headers } = signed("charge.success", {
      reference: ref,
      id: 42,
      status: "success",
    });
    const deliver = () =>
      handleProviderWebhook({
        providerCode: "paystack",
        countryCode: "GH",
        rawBody: body,
        headers,
        deps,
      });
    const [a, b, c] = await Promise.all([deliver(), deliver(), deliver()]);
    for (const r of [a, b, c]) expect(r.status).toBe(200);
    expect(await ticketsOf(buyer)).toHaveLength(1);
    expect(await transactionsOf(buyer)).toHaveLength(1);
  });

  it("a verify that times out leaves the payment retryable, and the retry completes it", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    provider.failNextVerify();
    const first = await finalizePayment(started.attempts[0].id, deps);
    expect(first.status).toBe("pending");
    expect(await ticketsOf(buyer)).toHaveLength(0);
    const retry = await finalizePayment(started.attempts[0].id, deps);
    expect(retry.status).toBe("succeeded");
    expect(await ticketsOf(buyer)).toHaveLength(1);
  });

  it("two tabs paying the same order with different methods: one order, the other payment refunded", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const tab1 = await pay([session], "card");
    const tab2 = await pay([session], "mobile_money");
    const ref1 = tab1.payment?.reference as string;
    const ref2 = tab2.payment?.reference as string;
    expect(ref1).not.toBe(ref2);
    provider.paid.add(ref1);
    provider.paid.add(ref2);
    const [h1, h2] = await Promise.all([
      webhookSuccess(ref1),
      webhookSuccess(ref2),
    ]);
    expect(h1.status).toBe(200);
    expect(h2.status).toBe(200);
    expect(await ticketsOf(buyer)).toHaveLength(1);
    expect(await transactionsOf(buyer)).toHaveLength(1);
    // The replaced tab's payment went back.
    expect(provider.refunds).toEqual([ref1]);
  });

  it("the same order paid twice concurrently through one checkout page is fulfilled once", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    // Browser verify + webhook + a second browser verify, all at once.
    const results = await Promise.all([
      finalizePayment(started.attempts[0].id, deps),
      webhookSuccess(ref),
      finalizePayment(started.attempts[0].id, deps),
    ]);
    expect(results.length).toBe(3);
    // Whatever each caller saw, the end state is one order.
    await finalizePayment(started.attempts[0].id, deps);
    expect(await ticketsOf(buyer)).toHaveLength(1);
    expect(await transactionsOf(buyer)).toHaveLength(1);
  });

  it("an order whose payment page was left open can be cancelled; paying that page afterwards is refunded", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    // The app closed on the payment page: the buyer cancels the order.
    const cancelled = await cancelTicketCheckoutSessionCore(
      buyer.client,
      buyer.id,
      session,
    );
    expect(cancelled.status).toBe(200);
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("status")
      .eq("id", started.attempts[0].id)
      .single();
    expect(attempt?.status).toBe("cancelled");
    // …then pays the old page anyway.
    provider.paid.add(ref);
    const hook = await webhookSuccess(ref);
    expect(hook.status).toBe(200);
    expect(await ticketsOf(buyer)).toHaveLength(0);
    expect(provider.refunds).toEqual([ref]);
  });

  it("an order can't be cancelled while its payment is being confirmed", async () => {
    fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    await service
      .from("payment_attempt")
      .update({ status: "processing" })
      .eq("id", started.attempts[0].id);
    const refused = await cancelTicketCheckoutSessionCore(
      buyer.client,
      buyer.id,
      session,
    );
    expect(refused.status).toBe(409);
    const { data: rows } = await service
      .from("ticket_checkout")
      .select("status")
      .eq("checkout_session_id", session);
    expect(rows?.map((r) => r.status)).toEqual(["pending"]);
    // Leave nothing open for the next test.
    await service
      .from("payment_attempt")
      .update({ status: "failed" })
      .eq("id", started.attempts[0].id);
  });

  it("a payment in the wrong currency issues nothing and is refunded", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    provider.reportCurrency.set(ref, "USD");
    const result = await finalizePayment(started.attempts[0].id, deps);
    expect(result.status).toBe("failed");
    expect(await ticketsOf(buyer)).toHaveLength(0);
    expect(provider.refunds).toEqual([ref]);
  });

  it("50 buyers racing for 10 tickets: exactly 10 checkouts hold seats", async () => {
    fakePaystack();
    const fixture = await newEvent(10);
    const racers = await Promise.all(
      Array.from({ length: 50 }, () => createTestUser(service)),
    );
    users.push(...racers);
    const results = await Promise.all(
      racers.map((r) =>
        validateCheckoutCore(r.client, r.id, {
          eventId: fixture.eventId,
          quantities: { [fixture.ticketTypeId]: 1 },
        }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(10);
    const { data: tt } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", fixture.ticketTypeId)
      .single();
    expect(tt?.quantity).toBe(0);
  });

  it("cancelling a paid ticket refunds the ticket price, keeps the fee, and the confirmation settles it", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    await finalizePayment(started.attempts[0].id, deps);
    const [ticket] = await ticketsOf(buyer);
    const cancelled = await cancelUserTicketCore(
      buyer.client,
      buyer.id,
      ticket.id,
      ticket.transaction_id,
    );
    expect(cancelled.status, cancelled.message).toBe(200);
    expect(provider.refunds).toEqual([ref]);
    const [txn] = await transactionsOf(buyer);
    expect(txn.status).toBe("refund_pending");
    const { data: ledger } = await service
      .from("organizer_ledger_entry")
      .select("entry_type, amount")
      .eq("transaction_id", txn.id)
      .order("created_at");
    expect(ledger).toEqual([
      { entry_type: "earning", amount: 50 },
      { entry_type: "refund_hold", amount: -50 },
    ]);
    const { body, headers } = signed("refund.processed", {
      id: `rf-${ref}`,
      status: "processed",
      transaction_reference: ref,
      transaction: { reference: ref },
    });
    const confirm = await handleProviderWebhook({
      providerCode: "paystack",
      countryCode: "GH",
      rawBody: body,
      headers,
      deps,
    });
    expect(confirm.status).toBe(200);
    const [after] = await transactionsOf(buyer);
    expect(after.status).toBe("refunded");
    const [ticketAfter] = await ticketsOf(buyer);
    expect(ticketAfter.status).toBe("cancelled");
  });

  async function buy(
    quantity: number,
    on?: {
      provider: ReturnType<typeof fakePaystack>;
      fixture: { eventId: string; ticketTypeId: string };
    },
  ) {
    const provider = on?.provider ?? fakePaystack();
    const fixture = on?.fixture ?? (await newEvent());
    const opened = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId: fixture.eventId,
      quantities: { [fixture.ticketTypeId]: quantity },
    });
    expect(opened.status, opened.message).toBe(200);
    const started = await pay([opened.checkoutSessionId as string]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    await finalizePayment(started.attempts[0].id, deps);
    const tickets = (await ticketsOf(buyer)).filter(
      (t) => t.transaction_id && !on,
    );
    if (!on) expect(tickets).toHaveLength(quantity);
    const [txn] = await transactionsOf(buyer);
    return { provider, fixture, ref, tickets, txn };
  }

  async function historyOf(user: TestUser) {
    const { data, error } = await user.client.rpc(
      "get_user_transaction_history",
      {
        p_start: null,
        p_end: null,
        p_cursor_created_at: null,
        p_cursor_id: null,
        p_limit: 20,
      } as never,
    );
    expect(error).toBeNull();
    return (data ?? []) as {
      kind: string;
      quantity: number;
      cancelled_quantity: number;
      refund_status: string | null;
      refund_requested_at: string | null;
    }[];
  }

  async function seatsLeft(ticketTypeId: string) {
    const { data } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", ticketTypeId)
      .single();
    return data?.quantity;
  }

  async function refundsOf(transactionId: string) {
    const { data } = await service
      .from("transaction_refund")
      .select("id, amount, status, completes_payment, provider_refund_id")
      .eq("transaction_id", transactionId)
      .order("created_at");
    return data ?? [];
  }

  async function holdsOf(transactionId: string) {
    const { data } = await service
      .from("organizer_ledger_entry")
      .select("entry_type, amount, refund_id")
      .eq("transaction_id", transactionId)
      .neq("entry_type", "earning")
      .order("created_at");
    return data ?? [];
  }

  async function statusOf(transactionId: string) {
    const { data } = await service
      .from("transaction")
      .select("status, refund_requested_at")
      .eq("id", transactionId)
      .single();
    return data;
  }

  async function refundWebhook(
    event: "refund.processed" | "refund.failed",
    reference: string,
    refundId: string | null,
    amountMinor: number | null,
  ) {
    const { body, headers } = signed(event, {
      ...(refundId ? { id: refundId } : {}),
      status: event === "refund.processed" ? "processed" : "failed",
      transaction_reference: reference,
      ...(amountMinor != null ? { amount: amountMinor, currency: "GHS" } : {}),
    });
    return handleProviderWebhook({
      providerCode: "paystack",
      countryCode: "GH",
      rawBody: body,
      headers,
      deps,
    });
  }

  async function cancel(ticketId: string, scope?: "ticket" | "payment") {
    return cancelUserTicketCore(
      buyer.client,
      buyer.id,
      ticketId,
      null,
      scope ? { scope } : {},
    );
  }

  it("three tickets, one friend can't come: that ticket's price comes back, the other two stay valid", async () => {
    const { provider, fixture, ref, tickets, txn } = await buy(3);
    const [first, second] = tickets;

    const quote = await ticketCancelQuoteCore(buyer.client, buyer.id, first.id);
    expect(quote).toEqual({
      status: 200,
      data: {
        paid: true,
        otherTicketIds: [],
        keptTicketCount: 2,
        eventTicketCount: 3,
        otherEvents: false,
        checkedIn: false,
        refund: { cashMinor: 5000, creditMinor: 0, currency: "GHS" },
      },
    });

    const one = await cancel(first.id);
    expect(one.status, one.message).toBe(200);
    const after = await ticketsOf(buyer);
    expect(after.find((t) => t.id === first.id)?.status).toBe("cancelled");
    expect(after.filter((t) => t.status === "active")).toHaveLength(2);
    expect(await seatsLeft(fixture.ticketTypeId)).toBe(18);
    expect(provider.refunds).toEqual([ref]);
    expect(provider.refundAmounts).toEqual([5000]);
    // The payment itself is not being refunded: it still reads as paid.
    expect(await statusOf(txn.id)).toEqual({
      status: "successful",
      refund_requested_at: null,
    });
    const [part] = await refundsOf(txn.id);
    expect(part).toMatchObject({
      amount: 50,
      status: "requested",
      completes_payment: false,
      provider_refund_id: `rf-1-${ref}`,
    });
    expect(await holdsOf(txn.id)).toEqual([
      { entry_type: "refund_hold", amount: -50, refund_id: part.id },
    ]);
    // Payment history reads the line from its ticket's refund, not from the
    // payment (still "successful").
    expect((await historyOf(buyer))[0]).toMatchObject({
      quantity: 3,
      cancelled_quantity: 1,
      refund_status: "refund_pending",
    });

    // The provider confirms it: that part is done, the payment still paid.
    const hook = await refundWebhook(
      "refund.processed",
      ref,
      `rf-1-${ref}`,
      5000,
    );
    expect(hook.status).toBe(200);
    expect((await refundsOf(txn.id))[0].status).toBe("processed");
    expect((await statusOf(txn.id))?.status).toBe("successful");
    expect((await historyOf(buyer))[0].refund_status).toBe("refunded");
    const { data: fee } = await service
      .from("platform_fee_entry")
      .select("entry_type, ticket_revenue, refund_id")
      .eq("transaction_id", txn.id)
      .eq("entry_type", "fee_refund_adjustment");
    expect(fee).toEqual([
      {
        entry_type: "fee_refund_adjustment",
        ticket_revenue: -50,
        refund_id: part.id,
      },
    ]);

    // Later the other two are cancelled together: the rest comes back and
    // the payment is refunded as a whole.
    const rest = await cancel(second.id, "payment");
    expect(rest.status, rest.message).toBe(200);
    expect(provider.refundAmounts).toEqual([5000, 10000]);
    expect((await statusOf(txn.id))?.status).toBe("refund_pending");
    expect(await seatsLeft(fixture.ticketTypeId)).toBe(20);
    const holds = await holdsOf(txn.id);
    expect(holds.reduce((sum, h) => sum + Number(h.amount), 0)).toBe(-150);

    // A redelivery of the first confirmation changes nothing; the second
    // finishes the payment.
    await refundWebhook("refund.processed", ref, `rf-1-${ref}`, 5000);
    expect((await statusOf(txn.id))?.status).toBe("refund_pending");
    await refundWebhook("refund.processed", ref, `rf-2-${ref}`, 10000);
    expect((await statusOf(txn.id))?.status).toBe("refunded");
    expect((await refundsOf(txn.id)).map((r) => r.status)).toEqual([
      "processed",
      "processed",
    ]);
  });

  it("the parts of a line add up to what was paid for it", async () => {
    const { txn, tickets } = await buy(3);
    // A line of three that came to 100 (a discount): 33.33 + 33.34 + 33.33.
    const { data: line } = await service
      .from("ticket")
      .select("ticket_checkout_id")
      .eq("id", tickets[0].id)
      .single();
    await service
      .from("ticket_checkout")
      .update({ total_price: 100 })
      .eq("id", line?.ticket_checkout_id as string);
    await service
      .from("organizer_ledger_entry")
      .update({ amount: 100 })
      .eq("ticket_checkout_id", line?.ticket_checkout_id as string)
      .eq("entry_type", "earning");

    for (const ticket of tickets) {
      expect((await cancel(ticket.id)).status).toBe(200);
    }
    const parts = await refundsOf(txn.id);
    expect(parts.map((r) => Number(r.amount))).toEqual([33.33, 33.34, 33.33]);
    expect(parts.map((r) => r.completes_payment)).toEqual([false, false, true]);
    const holds = await holdsOf(txn.id);
    expect(holds.map((h) => Number(h.amount))).toEqual([
      -33.33, -33.34, -33.33,
    ]);
  });

  it("a refused part can be asked again, and the organizer's hold follows", async () => {
    const { provider, ref, tickets, txn } = await buy(2);

    // The provider refuses when asked.
    provider.failNextRefund();
    const refused = await cancel(tickets[0].id);
    expect(refused.status).toBe(200);
    expect((await refundsOf(txn.id)).map((r) => r.status)).toEqual(["failed"]);
    expect(await holdsOf(txn.id)).toEqual([]);

    // Retry refund (issueRefundCore) asks again for that ticket.
    const retry = await issueRefundCore(buyer.client, txn.id, {
      expectedUserId: buyer.id,
    });
    expect(retry.status, retry.message).toBe(200);
    expect(provider.refundAmounts).toEqual([5000]);
    expect((await refundsOf(txn.id)).map((r) => r.status)).toEqual([
      "failed",
      "requested",
    ]);

    // Then the provider reports that part failed: the hold goes back and
    // the ticket can be refunded again.
    await refundWebhook("refund.failed", ref, `rf-1-${ref}`, null);
    expect((await refundsOf(txn.id)).map((r) => r.status)).toEqual([
      "failed",
      "failed",
    ]);
    const net = (await holdsOf(txn.id)).reduce(
      (sum, h) => sum + Number(h.amount),
      0,
    );
    expect(net).toBe(0);
    expect((await statusOf(txn.id))?.status).toBe("successful");
    const again = await issueRefundCore(buyer.client, txn.id, {
      expectedUserId: buyer.id,
    });
    expect(again.status, again.message).toBe(200);
    expect(provider.refundAmounts).toEqual([5000, 5000]);

    // The ticket left in the payment is untouched throughout.
    const left = (await ticketsOf(buyer)).find((t) => t.id === tickets[1].id);
    expect(left?.status).toBe("active");
  });

  it("a checked-in ticket doesn't stop the others of its payment being refunded", async () => {
    const { provider, tickets } = await buy(2);
    const [scanned, other] = tickets;
    await service
      .from("ticket")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", scanned.id);

    const quote = await ticketCancelQuoteCore(buyer.client, buyer.id, other.id);
    expect(quote.status === 200 && quote.data.checkedIn).toBe(false);
    const cancelled = await cancel(other.id);
    expect(cancelled.status, cancelled.message).toBe(200);
    expect(provider.refundAmounts).toEqual([5000]);
    // The checked-in ticket can't be cancelled.
    expect((await cancel(scanned.id)).status).toBe(409);
  });

  it("cancel all my tickets for an event: every payment gives back its share", async () => {
    const first = await buy(2);
    await buy(1, { provider: first.provider, fixture: first.fixture });
    const tickets = await ticketsOf(buyer);
    expect(tickets).toHaveLength(3);

    const single = await ticketCancelQuoteCore(
      buyer.client,
      buyer.id,
      tickets[0].id,
    );
    expect(single.status === 200 && single.data.eventTicketCount).toBe(3);

    const quote = await eventCancelQuoteCore(
      buyer.client,
      buyer.id,
      first.fixture.eventId,
    );
    expect(quote.status).toBe(200);
    if (quote.status !== 200) throw new Error("unreachable");
    expect(quote.data.ticketIds).toHaveLength(3);
    expect(quote.data).toMatchObject({
      paid: true,
      blocked: null,
      refund: { cashMinor: 15000, creditMinor: 0, currency: "GHS" },
    });

    const all = await cancelEventTicketsCore(
      buyer.client,
      buyer.id,
      first.fixture.eventId,
    );
    expect(all.status, all.message).toBe(200);
    expect((await ticketsOf(buyer)).map((t) => t.status)).toEqual([
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
    expect(await seatsLeft(first.fixture.ticketTypeId)).toBe(20);
    expect([...first.provider.refundAmounts].sort()).toEqual([10000, 5000]);
    const payments = await transactionsOf(buyer);
    expect(payments.map((p) => p.status)).toEqual([
      "refund_pending",
      "refund_pending",
    ]);

    // Nothing left: a second tap says so.
    const again = await cancelEventTicketsCore(
      buyer.client,
      buyer.id,
      first.fixture.eventId,
    );
    expect(again.status).toBe(404);

    // Admin › Finance › Refunds › Ticket refunds lists both parts.
    const parts = await listRefundPartsCore(
      service as never,
      {
        userId: buyer.id,
        email: null,
        roles: ["finance_admin"],
        permissions: ["finance.view"],
        reauthenticatedAt: Date.now(),
      },
      {},
    );
    expect(parts.status).toBe(200);
    const ours = parts.data.filter((p) =>
      payments.some((t) => t.id === p.transactionId),
    );
    expect(ours.map((p) => p.amount).sort()).toEqual([100, 50]);
    expect(ours.every((p) => p.completesPayment)).toBe(true);
  });
});
