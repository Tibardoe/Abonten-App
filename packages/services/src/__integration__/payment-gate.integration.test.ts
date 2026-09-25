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
import { cancelTicketCheckoutSessionCore } from "../checkout/cancelTicketCheckoutSessionCore";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { invalidateMarketCache } from "../markets/marketConfig";
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
import { cancelUserTicketCore } from "../tickets/cancelUserTicketCore";
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
      refunds.push(input.reference ?? "");
    },
  );
  return {
    opened,
    paid,
    reportCurrency,
    refunds,
    failNextVerify: (n = 1) => {
      verifyFailures = n;
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

  it("an order can't be cancelled while its payment is open; a payment after it closed is refunded", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await pay([session]);
    const ref = started.payment?.reference as string;
    const refused = await cancelTicketCheckoutSessionCore(
      buyer.client,
      buyer.id,
      session,
    );
    expect(refused.status).not.toBe(200);
    // The buyer abandons the page: the attempt closes, the checkout lapses.
    await service
      .from("payment_attempt")
      .update({ status: "failed" })
      .eq("id", started.attempts[0].id);
    await service
      .from("ticket_checkout")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("checkout_session_id", session);
    await service.rpc("expire_stale_ticket_checkouts");
    // …then pays the old page anyway.
    provider.paid.add(ref);
    const hook = await webhookSuccess(ref);
    expect(hook.status).toBe(200);
    expect(await ticketsOf(buyer)).toHaveLength(0);
    expect(provider.refunds).toEqual([ref]);
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
});
