import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// A payment attempt is bound to the ONE charge it was started for. These
// cases cover what happens when a buyer comes back to an order after a
// provider page was already opened for it — a stale tab, a changed basket —
// with the provider stubbed in memory so the exact amounts and references
// Abonten sends can be checked (nothing leaves the machine).
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
import { invalidateMarketCache } from "../markets/marketConfig";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { paystackProvider } from "../payments/providers/paystackProvider";
import type {
  CheckoutInit,
  VerificationResult,
} from "../payments/providers/types";
import { handleProviderWebhook } from "../payments/webhookCore";
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

/** An in-memory Paystack: remembers every checkout it opened and its amount. */
function fakePaystack() {
  const opened = new Map<string, number>();
  const paid = new Set<string>();
  const refunds: string[] = [];
  vi.spyOn(paystackProvider, "initializeCheckout").mockImplementation(
    async (_account, input): Promise<CheckoutInit> => {
      opened.set(input.reference, input.amount.amountMinor);
      return {
        mode: "popup",
        provider: "paystack",
        reference: input.reference,
        accessCode: `ac_${input.reference}`,
        authorizationUrl: `https://checkout.example/${input.reference}`,
        publicKey: null,
      };
    },
  );
  vi.spyOn(paystackProvider, "verify").mockImplementation(
    async (_account, reference): Promise<VerificationResult> => ({
      status: paid.has(reference) ? "success" : "abandoned",
      reference,
      amount: { amountMinor: opened.get(reference) ?? 0, currency: "GHS" },
      providerTransactionId: `tx_${reference}`,
      providerFee: null,
      channel: "card",
      customerEmail: "buyer@example.com",
      instrument: null,
      detail: null,
      raw: {},
    }),
  );
  vi.spyOn(paystackProvider, "refund").mockImplementation(
    async (_account, input) => {
      refunds.push(input.reference ?? "");
    },
  );
  return { opened, paid, refunds };
}

describe("payment attempt reuse is bound to one charge", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  const events: { eventId: string; ticketTypeId: string }[] = [];
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
      process.env[name] = "sk_test_fake_for_integration";
    }
    invalidateMarketCache();
    organizer = await createTestUser(service);
    for (let i = 0; i < 2; i++) {
      events.push(
        await createTestEventWithTicketType(service, organizer.id, {
          quantity: 10,
          price: 50,
        }),
      );
    }
  });

  const buyers: TestUser[] = [];
  beforeEach(async () => {
    buyer = await createTestUser(service);
    buyers.push(buyer);
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
    for (const e of events) {
      await deleteTestEvent(service, e.eventId).catch(() => undefined);
    }
    await Promise.all(
      [organizer, ...buyers].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function openSession(index: number): Promise<string> {
    const { eventId, ticketTypeId } = events[index];
    const opened = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
    });
    expect(opened.status, opened.message).toBe(200);
    return opened.checkoutSessionId as string;
  }

  async function pay(sessionIds: string[]) {
    const started = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      "buyer@example.com",
      { checkoutSessionIds: sessionIds, method: "card", platform: "web" },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(started.status, JSON.stringify(started)).toBe(200);
    if (started.status !== 200) throw new Error("unreachable");
    return started.data;
  }

  it("never hands back a checkout opened for a different amount", async () => {
    const provider = fakePaystack();
    const sessionA = await openSession(0);
    const sessionB = await openSession(1);

    // A alone: GH₵50 + 5% fee.
    const first = await pay([sessionA]);
    expect(provider.opened.get(first.payment?.reference as string)).toBe(5250);

    // Then A and B together: the checkout handed back must be for both.
    const second = await pay([sessionA, sessionB]);
    expect(provider.opened.get(second.payment?.reference as string)).toBe(
      10500,
    );
  });

  it("a double-tapped Pay opens one charge, not two", async () => {
    const provider = fakePaystack();
    const sessionA = await openSession(0);
    const start = () =>
      createMultiCheckoutPaymentAttemptCore(
        buyer.client,
        buyer.id,
        "buyer@example.com",
        { checkoutSessionIds: [sessionA], method: "card", platform: "web" },
        (id) => `https://example.test/checkout/${id}`,
        deps,
      );
    const results = await Promise.all([start(), start(), start()]);
    const refs = new Set(
      results.flatMap((r) =>
        r.status === 200 && r.data.payment ? [r.data.payment.reference] : [],
      ),
    );
    // Every successful answer points at the same single provider checkout.
    expect(refs.size).toBe(1);
    expect(provider.opened.size).toBe(1);
    const { data: open } = await service
      .from("payment_attempt")
      .select("id")
      .eq("checkout_session_id", sessionA)
      .in("status", ["initiated", "pending", "processing"]);
    expect(open?.length).toBe(1);
  });

  it("changing the basket retires the old checkout instead of reusing it", async () => {
    const provider = fakePaystack();
    const sessionA = await openSession(0);
    const sessionB = await openSession(1);
    const first = await pay([sessionA]);
    const second = await pay([sessionA, sessionB]);
    expect(provider.opened.get(second.payment?.reference as string)).toBe(
      10500,
    );
    // Only the combined order's primary carries a live reference.
    const { data: members } = await service
      .from("payment_attempt")
      .select("id, provider_reference, status")
      .eq("payment_group_id", second.paymentGroupId);
    expect(members?.filter((m) => m.provider_reference).length).toBe(1);
    // The first checkout's reference is still on a (now cancelled) attempt,
    // so a late payment on it is recognised.
    const { data: stale } = await service
      .from("payment_attempt")
      .select("status")
      .eq("provider_reference", first.payment?.reference as string)
      .single();
    expect(stale?.status).toBe("cancelled");
  });

  it("refunds a stale tab paid after the order was paid another way", async () => {
    const provider = fakePaystack();
    const sessionA = await openSession(0);
    const sessionB = await openSession(1);

    const first = await pay([sessionA]);
    const staleRef = first.payment?.reference as string;
    const second = await pay([sessionA, sessionB]);
    const groupRef = second.payment?.reference as string;
    expect(groupRef).not.toBe(staleRef);

    // The buyer pays the combined order…
    provider.paid.add(groupRef);
    const done = await finalizePayment(second.attempts[0].id, deps);
    expect(done.status).toBe("succeeded");

    // …and then the old tab for A alone. That money has no order and must go
    // back, whichever way Abonten hears about it.
    provider.paid.add(staleRef);
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: staleRef, id: 1, amount: 5250, currency: "GHS" },
    });
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha512", "sk_test_fake_for_integration")
      .update(body)
      .digest("hex");
    const res = await handleProviderWebhook({
      providerCode: "paystack",
      countryCode: "GH",
      rawBody: body,
      headers: new Headers({ "x-paystack-signature": signature }),
      deps,
    });
    expect(res.status).toBe(200);
    expect(provider.refunds).toContain(staleRef);
    const { data: orphan } = await service
      .from("payment_orphan_capture")
      .select("status, amount")
      .eq("provider", "paystack")
      .eq("provider_reference", staleRef)
      .maybeSingle();
    expect(orphan?.status).toBe("refund_requested");
  });
});
