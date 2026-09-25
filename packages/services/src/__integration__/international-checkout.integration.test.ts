import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25): a whole paid checkout in a currency without
// decimals. Côte d'Ivoire (XOF, exponent 0) is switched live for the test
// with Paystack replaced by a double; every amount must stay in whole
// francs from the price to the provider charge, the transaction, the
// organizer's earning and Abonten's fee — no "/ 100", no two decimals.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { invalidateMarketCache } from "../markets/marketConfig";
import { issueRefundCore } from "../organizer/issueRefundCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { paystackProvider } from "../payments/providers/paystackProvider";
import {
  type TestUser,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];

const KEY = "sk_test_international_gate";

describe("a paid checkout in XOF (no minor unit)", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  const saved: {
    market?: Record<string, unknown>;
    provider?: boolean;
    card?: boolean;
    env: Record<string, string | undefined>;
  } = { env: {} };

  const deps: PaymentFulfillmentDeps = {
    issueTickets: async (sessionId, transactionId, metadata, auth) => {
      const { data: rows } = await service
        .from("ticket_checkout")
        .select("id, ticket_type_id, quantity")
        .eq("checkout_session_id", sessionId)
        .eq("user_id", auth.userId);
      const { error } = await service.rpc("issue_tickets_for_checkout", {
        p_checkout_session_id: sessionId,
        p_user_id: auth.userId,
        p_transaction_id: transactionId,
        p_metadata: JSON.parse(metadata),
        p_ticket_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        p_tickets: (rows ?? []).flatMap((r) =>
          Array.from({ length: r.quantity }, () => ({
            checkout_id: r.id,
            ticket_type_id: r.ticket_type_id,
            ticket_code: `TKT-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
            qr_public_id: "test/qr",
            qr_version: "1",
          })),
        ),
      } as unknown as Args<"issue_tickets_for_checkout">);
      return error ? { status: 500, message: error.message } : { status: 200 };
    },
    activatePlacePromotion: async () => ({ status: 500, message: "unused" }),
    activateEventPromotion: async () => ({ status: 500, message: "unused" }),
  };

  beforeAll(async () => {
    service = getServiceClient();
    const { data: market } = await service
      .from("market")
      .select("status, version")
      .eq("country_code", "CI")
      .single();
    saved.market = market as Record<string, unknown>;
    const { data: acct } = await service
      .from("market_payment_provider")
      .select("secret_key_env, webhook_secret_env, enabled")
      .eq("country_code", "CI")
      .eq("provider", "paystack")
      .single();
    saved.provider = acct?.enabled as boolean;
    const { data: card } = await service
      .from("market_payment_method")
      .select("enabled")
      .eq("country_code", "CI")
      .eq("method", "card")
      .single();
    saved.card = card?.enabled as boolean;
    for (const name of [
      acct?.secret_key_env as string,
      acct?.webhook_secret_env as string,
    ]) {
      saved.env[name] = process.env[name];
      process.env[name] = KEY;
    }
    await service
      .from("market")
      .update({ status: "live" })
      .eq("country_code", "CI");
    await service
      .from("market_payment_provider")
      .update({ enabled: true })
      .eq("country_code", "CI")
      .eq("provider", "paystack");
    await service
      .from("market_payment_method")
      .update({ enabled: true })
      .eq("country_code", "CI")
      .eq("method", "card");
    invalidateMarketCache();

    [organizer, buyer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    const { data: id, error } = await service.rpc("create_event", {
      p_client_request_id: crypto.randomUUID(),
      p_organizer_id: organizer.id,
      p_title: "Abidjan XOF gate",
      p_slug: `abidjan-xof-${crypto.randomUUID()}`,
      p_description: "Created by the international checkout suite.",
      p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      p_event_category: "conference",
      p_event_type: ["Live Concerts"],
      p_latitude: 5.36,
      p_longitude: -4.008,
      p_address: { city: "Abidjan", country: "Côte d'Ivoire" },
      p_capacity: 100,
      p_website_url: null,
      p_flyer_public_id: "test/flyer",
      p_flyer_version: "1",
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      p_ends_at: new Date(Date.now() + 90_000_000).toISOString(),
      p_require_registration: false,
      p_featured: false,
      p_specific_dates: null,
      p_ticket_types: [
        {
          type: "General",
          price: 5000,
          currency: "XOF",
          quantity: 10,
          available_from: null,
          available_until: null,
        },
      ],
      p_promo_codes: null,
      p_receiving_account: null,
      p_place_id: null,
      p_country_code: "CI",
      p_timezone: "Africa/Abidjan",
      p_currency: "XOF",
    } as unknown as Args<"create_event">);
    if (error || !id) throw new Error(`create_event: ${error?.message}`);
    eventId = id as unknown as string;
    const { data: tt } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", eventId)
      .single();
    ticketTypeId = tt?.id as string;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await service
      .from("market")
      .update({ status: saved.market?.status as string })
      .eq("country_code", "CI");
    await service
      .from("market_payment_provider")
      .update({ enabled: saved.provider })
      .eq("country_code", "CI")
      .eq("provider", "paystack");
    await service
      .from("market_payment_method")
      .update({ enabled: saved.card })
      .eq("country_code", "CI")
      .eq("method", "card");
    for (const [name, value] of Object.entries(saved.env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    invalidateMarketCache();
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await Promise.all(
      [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("charges, records and pays out whole francs", async () => {
    const opened = new Map<string, { amountMinor: number; currency: string }>();
    vi.spyOn(paystackProvider, "initializeCheckout").mockImplementation(
      async (_account, input) => {
        opened.set(input.reference, input.amount);
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
      async (_account, reference) => ({
        status: "success",
        reference,
        amount: opened.get(reference) ?? { amountMinor: 0, currency: "XOF" },
        providerTransactionId: `tx_${reference}`,
        providerFee: null,
        channel: "card",
        customerEmail: "buyer@example.com",
        instrument: null,
        detail: null,
        raw: {},
      }),
    );

    const checkout = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 1 },
    });
    expect(checkout.status, checkout.message).toBe(200);

    const started = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      {
        checkoutSessionIds: [checkout.checkoutSessionId as string],
        method: "card",
        platform: "web",
      },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(started.status, JSON.stringify(started)).toBe(200);
    if (started.status !== 200) return;
    const reference = started.data.payment?.reference as string;

    // 5,000 F + 5% service fee = 5,250 F. XOF has no minor unit, so the
    // provider is asked for 5250 — not 525000.
    expect(opened.get(reference)).toEqual({
      amountMinor: 5250,
      currency: "XOF",
    });

    expect(
      (await finalizePayment(started.data.attempts[0].id, deps)).status,
    ).toBe("succeeded");

    const { data: txn } = await service
      .from("transaction")
      .select("id, amount, currency")
      .eq("user_id", buyer.id)
      .single();
    expect(txn).toMatchObject({ amount: 5250, currency: "XOF" });
    const { data: earning } = await service
      .from("organizer_ledger_entry")
      .select("entry_type, amount, currency")
      .eq("transaction_id", txn?.id as string);
    expect(earning).toEqual([
      { entry_type: "earning", amount: 5000, currency: "XOF" },
    ]);
    const { data: fee } = await service
      .from("platform_fee_entry")
      .select("ticket_revenue, service_fee, total_customer_payment, currency")
      .eq("transaction_id", txn?.id as string);
    expect(fee).toEqual([
      {
        ticket_revenue: 5000,
        service_fee: 250,
        total_customer_payment: 5250,
        currency: "XOF",
      },
    ]);
    const { count } = await service
      .from("ticket")
      .select("id", { count: "exact", head: true })
      .eq("user_id", buyer.id);
    expect(count).toBe(1);

    // The refund returns the ticket price in whole francs (the fee is kept)
    // and holds it against the organizer's balance.
    const refunds: { amountMinor: number; currency: string }[] = [];
    vi.spyOn(paystackProvider, "refund").mockImplementation(
      async (_account, input) => {
        if (input.amount) refunds.push(input.amount);
      },
    );
    const refund = await issueRefundCore(service, txn?.id as string);
    expect(refund.status, refund.message).toBe(200);
    expect(refunds).toEqual([{ amountMinor: 5000, currency: "XOF" }]);
    const { data: hold } = await service
      .from("organizer_ledger_entry")
      .select("entry_type, amount, currency")
      .eq("transaction_id", txn?.id as string)
      .eq("entry_type", "refund_hold");
    expect(hold).toEqual([
      { entry_type: "refund_hold", amount: -5000, currency: "XOF" },
    ]);
  });

  it("refuses prices and payouts finer than the currency allows", async () => {
    // XOF has no minor unit; KWD has three decimals.
    const { error: xofFraction } = await service
      .from("ticket_type")
      .update({ price: 5000.5 })
      .eq("id", ticketTypeId);
    expect(xofFraction?.message).toMatch(/decimal/i);
    const { data: kwd } = await service.rpc("money_round", {
      p_amount: 1.2345,
      p_currency: "KWD",
    } as never);
    expect(Number(kwd)).toBe(1.235);
    const { data: ghs } = await service.rpc("money_round", {
      p_amount: 1.235,
      p_currency: "GHS",
    } as never);
    expect(Number(ghs)).toBe(1.24);
  });
});
