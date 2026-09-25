import { createHmac } from "node:crypto";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// The global-platform hardening pass, against the real database:
//   * money helpers and storage keep each currency's own precision (XOF and
//     JPY have no decimals, KWD three), and markets can only use currencies
//     Abonten can store;
//   * market transitions are pinned to the configuration version the
//     readiness check ran on, and every configuration change bumps it;
//   * a paused market's listings leave discovery;
//   * checkout accepts a market-configured METHOD without a saved card,
//     refuses one the market doesn't offer, and refuses a market that isn't
//     selling;
//   * money a provider captures after its attempt closed is refunded once,
//     recorded, and marked refunded by the provider's confirmation;
//   * a refund confirmation that overtakes the refund request is redelivered,
//     not lost.
// Only Paystack's HTTP calls are replaced (vi.mock); everything else is real.
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
import { invalidateMarketCache } from "../markets/marketConfig";
import { getCheckoutPaymentOptionsCore } from "../payments/checkoutPaymentOptionsCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { markOrphanCaptureRefund } from "../payments/orphanCapture";
import { webhookAckStatus } from "../payments/webhookAck";
import { handleProviderWebhook } from "../payments/webhookCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
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

const neverDeps: PaymentFulfillmentDeps = {
  issueTickets: async () => ({ status: 500, message: "not used" }),
  activatePlacePromotion: async () => ({ status: 500, message: "not used" }),
  activateEventPromotion: async () => ({ status: 500, message: "not used" }),
};

let service: SupabaseClient<Database>;
let organizer: TestUser;
let buyer: TestUser;
let eventId: string;
let ticketTypeId: string;

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
});

afterAll(async () => {
  await service
    .from("market")
    .update({ status: "draft" })
    .eq("country_code", "KE");
  invalidateMarketCache();
  await deleteTestEvent(service, eventId).catch(() => undefined);
  await Promise.all(
    [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
  );
});

beforeEach(() => {
  paystack.verifyTransaction.mockReset();
  paystack.refundTransaction.mockReset();
  paystack.refundTransaction.mockResolvedValue({ status: "pending" });
  paystack.initializeTransaction.mockReset();
  paystack.initializeTransaction.mockImplementation(
    async (_account: unknown, p: { reference: string }) => ({
      reference: p.reference,
      access_code: "test-access",
      authorization_url: "https://checkout.paystack.test/x",
    }),
  );
});

async function openCheckout(): Promise<string> {
  await service
    .from("ticket_checkout")
    .update({ status: "cancelled" })
    .eq("user_id", buyer.id)
    .eq("status", "pending");
  const opened = await validateCheckoutCore(buyer.client, buyer.id, {
    eventId,
    quantities: { [ticketTypeId]: 1 },
  });
  expect(opened.status).toBe(200);
  return opened.checkoutSessionId as string;
}

describe("money keeps its currency's precision", () => {
  it("converts and rounds with each currency's own exponent", async () => {
    const one = async (sql: string) => {
      const [fn, ...args] = sql.split(":");
      const { data, error } = await service.rpc(
        fn as never,
        Object.fromEntries(args.map((a) => a.split("="))) as never,
      );
      expect(error).toBeNull();
      return data as unknown;
    };
    expect(Number(await one("minor_to_major:p_minor=500:p_currency=XOF"))).toBe(
      500,
    );
    expect(
      Number(await one("minor_to_major:p_minor=1234:p_currency=KWD")),
    ).toBe(1.234);
    expect(
      Number(await one("minor_to_major:p_minor=1250:p_currency=GHS")),
    ).toBe(12.5);
    expect(Number(await one("money_round:p_amount=999.5:p_currency=JPY"))).toBe(
      1000,
    );
    expect(
      Number(await one("major_to_minor:p_amount=1.234:p_currency=KWD")),
    ).toBe(1234);
    const unknown = await service.rpc(
      "currency_minor_units" as never,
      {
        p_currency: "ZZZ",
      } as never,
    );
    expect(unknown.error?.message).toMatch(/Unknown currency ZZZ/);
  });

  it("stores a three-decimal amount without losing the third decimal", async () => {
    const reference = `HARDEN-${crypto.randomUUID()}`;
    const { data, error } = await service
      .from("transaction")
      .insert({
        user_id: buyer.id,
        full_name: "Precision",
        email: buyer.email,
        reason: "Ticket_Purchase",
        amount: 1.234,
        currency: "KWD",
        status: "successful",
        payment_method: "card",
        provider: "paystack",
        provider_reference: reference,
        country_code: "GH",
      } as never)
      .select("id, amount")
      .single();
    expect(error).toBeNull();
    expect(Number((data as { amount: number }).amount)).toBe(1.234);
    await service
      .from("transaction")
      .delete()
      .eq("id", (data as { id: string }).id);
  });

  it("refuses a market currency Abonten cannot store", async () => {
    // The currency table itself only holds exponents 0-3, and a market can
    // only name currencies from it.
    const fourDecimals = await service.from("currency").insert({
      code: "CLF",
      name: "Unidad de Fomento",
      minor_units: 4,
      symbol: "UF",
    } as never);
    expect(fourDecimals.error).not.toBeNull();
    const refused = await service
      .from("market")
      .update({ supported_currencies: ["KES", "CLF"] })
      .eq("country_code", "KE");
    expect(refused.error?.message).toMatch(/Unknown currency CLF/);
    const kwd = await service
      .from("market")
      .update({ supported_currencies: ["KES", "KWD"] })
      .eq("country_code", "KE");
    expect(kwd.error).toBeNull();
    await service
      .from("market")
      .update({ supported_currencies: ["KES"] })
      .eq("country_code", "KE");
  });
});

describe("market configuration version", () => {
  it("bumps on configuration changes and pins transitions to it", async () => {
    const version = async () =>
      (
        await service
          .from("market")
          .select("version")
          .eq("country_code", "KE")
          .single()
      ).data?.version as number;

    const v0 = await version();
    await service
      .from("market")
      .update({ name: "Kenya" })
      .eq("country_code", "KE");
    expect(await version()).toBe(v0); // no real change
    await service
      .from("market")
      .update({ display_config: { priceScale: 10 } } as never)
      .eq("country_code", "KE");
    const v1 = await version();
    expect(v1).toBe(v0 + 1);

    const stale = await service.rpc("market_transition", {
      p_country_code: "KE",
      p_transition: "prepare",
      p_actor_id: organizer.id,
      p_reason: "integration test",
      p_expected_version: v0,
    } as never);
    expect(stale.error?.message).toMatch(/changed while it was being checked/);

    const current = await service.rpc("market_transition", {
      p_country_code: "KE",
      p_transition: "prepare",
      p_actor_id: organizer.id,
      p_reason: "integration test",
      p_expected_version: v1,
    } as never);
    expect(current.error).toBeNull();
    await service
      .from("market")
      .update({ status: "draft", display_config: {} } as never)
      .eq("country_code", "KE");
    await service
      .from("market_event")
      .delete()
      .eq("country_code", "KE")
      .eq("actor_id", organizer.id);
  });
});

describe("a market that is not live", () => {
  it("hides its listings from discovery and sells nothing", async () => {
    // Move the test event into Kenya (draft), then check discovery and
    // checkout, then bring it back.
    await service
      .from("event")
      .update({ country_code: "KE" })
      .eq("id", eventId);
    invalidateMarketCache();

    const window = () =>
      service.rpc("get_events_in_window", {
        p_user_lat: 5.6037,
        p_user_lng: -0.187,
        p_radius_km: 50,
        p_window_start: new Date().toISOString(),
        p_window_end: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        // Other suites leave events near Accra: read far enough to find ours.
        p_page_size: 1000,
      } as never);
    const hidden = await window();
    expect(hidden.error).toBeNull();
    expect(
      ((hidden.data ?? []) as { id: string }[]).some((e) => e.id === eventId),
    ).toBe(false);

    // Checkout is refused before any money moves.
    await service
      .from("event")
      .update({ country_code: "GH" })
      .eq("id", eventId);
    const sessionId = await openCheckout();
    await service
      .from("event")
      .update({ country_code: "KE" })
      .eq("id", eventId);
    const refused = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { checkoutSessionIds: [sessionId], method: "card", platform: "web" },
      (id) => `https://example.test/checkout/${id}`,
      neverDeps,
    );
    expect(refused.status).toBe(409);
    expect("message" in refused ? refused.message : "").toMatch(
      /Sales are paused in Kenya/,
    );
    expect(paystack.initializeTransaction).not.toHaveBeenCalled();

    await service
      .from("event")
      .update({ country_code: "GH" })
      .eq("id", eventId);
    invalidateMarketCache();
    const shown = await window();
    expect(
      ((shown.data ?? []) as { id: string }[]).some((e) => e.id === eventId),
    ).toBe(true);
  });
});

describe("paying with a market method, no saved card", () => {
  it("offers the market's methods and starts the provider page for one of them", async () => {
    const sessionId = await openCheckout();
    const options = await getCheckoutPaymentOptionsCore(
      buyer.client,
      buyer.id,
      { kind: "ticket", checkoutSessionIds: [sessionId] },
      "web",
    );
    expect(options.status).toBe(200);
    if (options.status !== 200) return;
    expect(options.data.countryCode).toBe("GH");
    expect(options.data.methods.map((m) => m.method)).toContain("card");

    const card = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { checkoutSessionIds: [sessionId], method: "card", platform: "web" },
      (id) => `https://example.test/checkout/${id}`,
      neverDeps,
    );
    expect(card.status).toBe(200);
    expect(paystack.initializeTransaction).toHaveBeenCalledTimes(1);
    expect(
      (
        paystack.initializeTransaction.mock.calls[0][1] as {
          channels?: string[];
        }
      ).channels,
    ).toEqual(["card"]);
  });

  it("refuses a method the market does not offer", async () => {
    const sessionId = await openCheckout();
    const ussd = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { checkoutSessionIds: [sessionId], method: "ussd", platform: "web" },
      (id) => `https://example.test/checkout/${id}`,
      neverDeps,
    );
    expect(ussd.status).toBe(400);
    expect(paystack.initializeTransaction).not.toHaveBeenCalled();
  });

  it("does not charge a card token another provider account issued, and refuses a foreign wallet", async () => {
    const [{ data: foreignCard }, { data: foreignWallet }] = await Promise.all([
      service
        .from("payment_method")
        .insert({
          user_id: buyer.id,
          method_type: "card",
          details: {
            brand: "visa",
            last4: "1111",
            expiryMonth: 1,
            expiryYear: 2030,
            authorizationCode: "AUTH_ng_only",
            provider: "paystack",
            countryCode: "NG",
          },
          status: "active",
        })
        .select("id")
        .single(),
      service
        .from("payment_method")
        .insert({
          user_id: buyer.id,
          method_type: "momo",
          details: {
            networkCode: "MPESA",
            networkName: "M-PESA",
            phone: "+254712345678",
          },
          status: "active",
        })
        .select("id")
        .single(),
    ]);
    const sessionId = await openCheckout();
    const options = await getCheckoutPaymentOptionsCore(
      buyer.client,
      buyer.id,
      { kind: "ticket", checkoutSessionIds: [sessionId] },
      "web",
    );
    if (options.status !== 200) throw new Error("options failed");
    const card = options.data.saved.find((s) => s.id === foreignCard?.id);
    const wallet = options.data.saved.find((s) => s.id === foreignWallet?.id);
    expect(card).toMatchObject({ usable: true, direct: false });
    expect(wallet).toMatchObject({ usable: false });
    expect(wallet?.reason).toMatch(/registered outside Ghana/);

    // The foreign token goes through the provider page, never a direct charge.
    const paid = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      {
        checkoutSessionIds: [sessionId],
        paymentMethodId: foreignCard?.id,
        platform: "web",
      },
      (id) => `https://example.test/checkout/${id}`,
      neverDeps,
    );
    expect(paid.status).toBe(200);
    if (paid.status === 200) expect(paid.data.payment?.mode).toBe("popup");

    await service
      .from("payment_method")
      .delete()
      .in("id", [foreignCard?.id as string, foreignWallet?.id as string]);
  });
});

describe("money captured after the attempt closed", () => {
  it("is refunded in full once, recorded, and marked refunded by the provider", async () => {
    const sessionId = await openCheckout();
    const started = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      {
        checkoutSessionIds: [sessionId],
        method: "mobile_money",
        platform: "web",
      },
      (id) => `https://example.test/checkout/${id}`,
      neverDeps,
    );
    expect(started.status).toBe(200);
    if (started.status !== 200) return;
    const attemptId = started.data.attempts[0].id;
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("provider_reference, amount, currency")
      .eq("id", attemptId)
      .single();
    const reference = attempt?.provider_reference as string;

    // The buyer switched away; later the old mobile-money prompt is approved.
    await service
      .from("payment_attempt")
      .update({ status: "cancelled" })
      .eq("id", attemptId);
    paystack.verifyTransaction.mockResolvedValue({
      id: 99,
      status: "success",
      reference,
      amount: Math.round(Number(attempt?.amount) * 100),
      currency: "GHS",
      gateway_response: "Approved",
      fees: 10,
      channel: "mobile_money",
      customer: { email: buyer.email },
    });

    const first = await finalizePayment(attemptId, neverDeps);
    expect(first.status).toBe("failed");
    expect(webhookAckStatus(first)).toBe(200);
    expect(paystack.refundTransaction).toHaveBeenCalledTimes(1);
    // Refunded in full: no partial amount.
    expect(paystack.refundTransaction.mock.calls[0][2]).toBeNull();

    // A redelivery does not ask for a second refund.
    const again = await finalizePayment(attemptId, neverDeps);
    expect(again.status).toBe("failed");
    expect(paystack.refundTransaction).toHaveBeenCalledTimes(1);

    const { data: orphan } = await service
      .from("payment_orphan_capture")
      .select("status, amount, currency, attempt_status, user_id")
      .eq("provider", "paystack")
      .eq("provider_reference", reference)
      .single();
    expect(orphan).toMatchObject({
      status: "refund_requested",
      currency: "GHS",
      attempt_status: "cancelled",
      user_id: buyer.id,
    });
    // No transaction, no ticket for it.
    const { count: txns } = await service
      .from("transaction")
      .select("id", { count: "exact", head: true })
      .eq("provider_reference", reference);
    expect(txns).toBe(0);

    expect(
      await markOrphanCaptureRefund({
        provider: "paystack",
        reference,
        providerTransactionId: null,
        outcome: "refunded",
      }),
    ).toBe("matched");
    const { data: done } = await service
      .from("payment_orphan_capture")
      .select("status, refunded_at")
      .eq("provider_reference", reference)
      .single();
    expect(done?.status).toBe("refunded");
    expect(done?.refunded_at).not.toBeNull();
    await service
      .from("payment_orphan_capture")
      .delete()
      .eq("provider_reference", reference);
  });

  it("asks the provider to redeliver when the refund request fails", async () => {
    const sessionId = await openCheckout();
    const started = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { checkoutSessionIds: [sessionId], method: "card", platform: "web" },
      (id) => `https://example.test/checkout/${id}`,
      neverDeps,
    );
    if (started.status !== 200) throw new Error("not started");
    const attemptId = started.data.attempts[0].id;
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("provider_reference, amount")
      .eq("id", attemptId)
      .single();
    await service
      .from("payment_attempt")
      .update({ status: "failed" })
      .eq("id", attemptId);
    paystack.verifyTransaction.mockResolvedValue({
      id: 100,
      status: "success",
      reference: attempt?.provider_reference,
      amount: Math.round(Number(attempt?.amount) * 100),
      currency: "GHS",
      channel: "card",
      customer: { email: buyer.email },
    });
    paystack.refundTransaction.mockRejectedValueOnce(
      new Error("Paystack down"),
    );

    const result = await finalizePayment(attemptId, neverDeps);
    expect(result.status).toBe("pending");
    expect(webhookAckStatus(result)).toBe(503);
    const { data: orphan } = await service
      .from("payment_orphan_capture")
      .select("status, last_error")
      .eq("provider_reference", attempt?.provider_reference as string)
      .single();
    expect(orphan).toMatchObject({ status: "refund_failed" });

    // The redelivery refunds it.
    const retry = await finalizePayment(attemptId, neverDeps);
    expect(retry.status).toBe("failed");
    expect(paystack.refundTransaction).toHaveBeenCalledTimes(2);
    await service
      .from("payment_orphan_capture")
      .delete()
      .eq("provider_reference", attempt?.provider_reference as string);
  });

  it("redelivers a refund confirmation that arrives before the refund is recorded", async () => {
    const { data: acct } = await service
      .from("market_payment_provider")
      .select("webhook_secret_env")
      .eq("country_code", "GH")
      .eq("provider", "paystack")
      .single();
    const secretEnv = acct?.webhook_secret_env as string;
    const previous = process.env[secretEnv];
    process.env[secretEnv] = "whsec_integration";
    invalidateMarketCache();
    const reference = `PSK-${crypto.randomUUID()}`;
    const { data: txn } = await service
      .from("transaction")
      .insert({
        user_id: buyer.id,
        full_name: "Race",
        email: buyer.email,
        reason: "Ticket_Purchase",
        amount: 50,
        currency: "GHS",
        status: "successful",
        provider: "paystack",
        provider_reference: reference,
        // issueRefundCore holds this claim while it asks the provider.
        refund_claimed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    const deliveryIds: string[] = [];
    try {
      const deliver = (eventId: string) => {
        const body = JSON.stringify({
          event: "refund.processed",
          data: {
            id: eventId,
            status: "processed",
            transaction_reference: reference,
            transaction: { reference },
          },
        });
        // Paystack has no event id: a delivery is the hash of its body.
        deliveryIds.push(
          createHmac("sha256", "paystack-event")
            .update(body)
            .digest("hex")
            .slice(0, 32),
        );
        return handleProviderWebhook({
          providerCode: "paystack",
          countryCode: "GH",
          rawBody: body,
          headers: new Headers({
            "x-paystack-signature": createHmac("sha512", "whsec_integration")
              .update(body)
              .digest("hex"),
          }),
          deps: neverDeps,
        });
      };
      const early = await deliver("rf-1");
      expect(early.status).toBe(503);
      expect(early.body).toMatchObject({ retry: "refund_in_flight" });

      // issueRefundCore records the hold; the redelivery now lands.
      await service
        .from("transaction")
        .update({ status: "refund_pending" })
        .eq("id", txn?.id as string);
      const redelivered = await deliver("rf-1");
      expect(redelivered.status).toBe(200);
      const { data: after } = await service
        .from("transaction")
        .select("status")
        .eq("id", txn?.id as string)
        .single();
      expect(after?.status).toBe("refunded");
    } finally {
      if (previous === undefined) delete process.env[secretEnv];
      else process.env[secretEnv] = previous;
      invalidateMarketCache();
      await service
        .from("payment_webhook_event")
        .delete()
        .eq("provider", "paystack")
        .in("event_id", deliveryIds);
      await service
        .from("transaction")
        .delete()
        .eq("id", txn?.id as string);
    }
  });
});
