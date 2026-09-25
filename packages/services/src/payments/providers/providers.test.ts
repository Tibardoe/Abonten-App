import { createHmac } from "node:crypto";
import type {
  MarketConfig,
  MarketPaymentProvider,
} from "@abonten/core/market/types";
import { NO_TAX } from "@abonten/core/market/types";
import { money } from "@abonten/core/money/money";
import { describe, expect, it } from "vitest";
import { paystackProvider } from "./paystackProvider";
import {
  accountFromConfig,
  getPaymentProvider,
  isPaymentProviderCode,
  missingProviderEnv,
  providerEnvNameProblem,
} from "./registry";
import { stripeProvider } from "./stripeProvider";
import type { ProviderAccount } from "./types";

const account = (over: Partial<ProviderAccount> = {}): ProviderAccount => ({
  provider: "paystack",
  countryCode: "GH",
  credentials: {
    secretKey: "sk_test_x",
    webhookSecret: "whsec_x",
    publicKey: "pk_test_x",
  },
  settlementCurrency: "GHS",
  currencies: ["GHS", "USD"],
  payoutsEnabled: false,
  accountRef: null,
  options: {},
  ...over,
});

const providerConfig = (
  over: Partial<MarketPaymentProvider> = {},
): MarketPaymentProvider => ({
  provider: "paystack",
  enabled: true,
  priority: 1,
  credentials: {
    secretKeyEnv: "PAYSTACK_NG_SECRET_KEY",
    webhookSecretEnv: "PAYSTACK_NG_WEBHOOK_SECRET",
    publicKeyEnv: "NEXT_PUBLIC_PAYSTACK_NG_PUBLIC_KEY",
  },
  settlementCurrency: "NGN",
  currencies: ["NGN", "USD"],
  payoutsEnabled: false,
  providerAccountRef: null,
  options: {},
  ...over,
});

const market: MarketConfig = {
  countryCode: "NG",
  name: "Nigeria",
  status: "draft",
  defaultCurrency: "NGN",
  supportedCurrencies: ["NGN"],
  defaultTimeZone: "Africa/Lagos",
  defaultLocale: "en-NG",
  supportedLocales: ["en-NG"],
  dialCode: "+234",
  distanceUnit: "km",
  otpProvider: "twilio",
  centre: null,
  tax: NO_TAX,
  fees: { serviceFeeBps: null },
  legal: { termsVersion: null, supportEmail: null, acknowledgedAt: null },
  addressSchema: null,
  paymentProviders: [],
  paymentMethods: [],
  payoutMethods: [],
  regions: [],
  priceScale: 1,
  launchedAt: null,
  version: 1,
};

describe("provider registry", () => {
  it("knows exactly the adapters that exist", () => {
    expect(isPaymentProviderCode("paystack")).toBe(true);
    expect(isPaymentProviderCode("stripe")).toBe(true);
    expect(isPaymentProviderCode("flutterwave")).toBe(false);
    expect(getPaymentProvider("stripe").code).toBe("stripe");
    expect(() => getPaymentProvider("nope")).toThrow(
      /Unknown payment provider/,
    );
  });

  it("names the missing env variables instead of falling back to another market's keys", () => {
    const env = {
      PAYSTACK_SECRET_KEY: "ghana-key",
      PAYSTACK_WEBHOOK_SECRET: "ghana-whsec",
    };
    expect(missingProviderEnv(providerConfig(), env)).toEqual([
      "PAYSTACK_NG_SECRET_KEY",
      "PAYSTACK_NG_WEBHOOK_SECRET",
    ]);
    expect(accountFromConfig(market, providerConfig(), env)).toBeNull();
  });

  it("can charge and refund without the webhook secret, but trusts no webhook then", () => {
    const acct = accountFromConfig(market, providerConfig(), {
      PAYSTACK_NG_SECRET_KEY: "sk_ng",
    });
    expect(acct?.credentials.webhookSecret).toBe("");
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "PSK-1", id: 1 },
    });
    const forged = new Headers({
      "x-paystack-signature": createHmac("sha512", "")
        .update(body)
        .digest("hex"),
    });
    expect(
      paystackProvider.parseWebhook(acct as ProviderAccount, body, forged),
    ).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("builds the account from the named variables, public key optional", () => {
    const env = {
      PAYSTACK_NG_SECRET_KEY: "sk_ng",
      PAYSTACK_NG_WEBHOOK_SECRET: "wh_ng",
    };
    const acct = accountFromConfig(market, providerConfig(), env);
    expect(acct).toMatchObject({
      provider: "paystack",
      countryCode: "NG",
      settlementCurrency: "NGN",
      credentials: {
        secretKey: "sk_ng",
        webhookSecret: "wh_ng",
        publicKey: null,
      },
    });
    expect(missingProviderEnv(providerConfig(), env)).toEqual([]);
  });
});

describe("paystack adapter", () => {
  it("offers only the channels Paystack runs in that business country", () => {
    expect(paystackProvider.capabilities(account()).methods).toEqual([
      "card",
      "mobile_money",
    ]);
    expect(
      paystackProvider.capabilities(account({ countryCode: "NG" })).methods,
    ).toEqual(
      expect.arrayContaining([
        "card",
        "bank_transfer",
        "bank_redirect",
        "ussd",
        "qr",
      ]),
    );
    expect(
      paystackProvider.capabilities(account({ countryCode: "NG" })).methods,
    ).not.toContain("mobile_money");
    expect(
      paystackProvider.capabilities(account({ countryCode: "ZA" })).methods,
    ).toContain("eft");
  });

  it("charges local rails only in the settlement currency, cards in any accepted currency", () => {
    const gh = account();
    expect(paystackProvider.supportsMethod(gh, "mobile_money", "GHS")).toBe(
      true,
    );
    expect(paystackProvider.supportsMethod(gh, "mobile_money", "USD")).toBe(
      false,
    );
    expect(paystackProvider.supportsMethod(gh, "card", "USD")).toBe(true);
    expect(paystackProvider.supportsMethod(gh, "card", "NGN")).toBe(false);
    expect(paystackProvider.supportsMethod(gh, "eft", "GHS")).toBe(false);
  });

  it("knows the tokenisation charge per currency", () => {
    expect(paystackProvider.cardVerificationAmount(account(), "GHS")).toEqual(
      money(100, "GHS"),
    );
    expect(
      paystackProvider.cardVerificationAmount(
        account({ countryCode: "NG" }),
        "NGN",
      ),
    ).toEqual(money(5000, "NGN"));
    expect(
      paystackProvider.cardVerificationAmount(account(), "JPY"),
    ).toBeNull();
  });

  const sign = (body: string, secret = "whsec_x") =>
    new Headers({
      "x-paystack-signature": createHmac("sha512", secret)
        .update(body)
        .digest("hex"),
    });

  it("rejects a webhook without a valid HMAC for THIS account", () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "PSK-1", id: 42 },
    });
    expect(
      paystackProvider.parseWebhook(account(), body, new Headers()),
    ).toEqual({ ok: false, reason: "missing_signature" });
    expect(
      paystackProvider.parseWebhook(
        account(),
        body,
        sign(body, "someone-elses-secret"),
      ),
    ).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
    expect(
      paystackProvider.parseWebhook(account(), "not json", sign("not json")),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("normalises charge, refund, dispute and transfer events", () => {
    const parse = (event: string, data: Record<string, unknown>) => {
      const body = JSON.stringify({ event, data });
      const parsed = paystackProvider.parseWebhook(account(), body, sign(body));
      if (!parsed.ok) throw new Error(parsed.reason);
      return parsed;
    };
    expect(
      parse("charge.success", { reference: "PSK-1", id: 42 }).event,
    ).toEqual({
      type: "payment.succeeded",
      reference: "PSK-1",
      providerTransactionId: "42",
    });
    expect(
      parse("charge.failed", {
        reference: "PSK-2",
        id: 43,
        gateway_response: "Declined",
      }).event,
    ).toEqual({
      type: "payment.failed",
      reference: "PSK-2",
      providerTransactionId: "43",
      detail: "Declined",
    });
    expect(
      parse("refund.processed", {
        transaction_reference: "PSK-1",
        amount: 5000,
        currency: "GHS",
      }).event,
    ).toEqual({
      type: "refund.processed",
      reference: "PSK-1",
      providerTransactionId: null,
      amount: money(5000, "GHS"),
    });
    expect(
      parse("charge.dispute.create", {
        id: 7,
        status: "awaiting-merchant-feedback",
        transaction: {
          reference: "PSK-1",
          id: 42,
          amount: 5000,
          currency: "GHS",
        },
      }).event,
    ).toMatchObject({
      type: "dispute.opened",
      disputeId: "7",
      reference: "PSK-1",
      amount: money(5000, "GHS"),
    });
    expect(
      parse("transfer.failed", {
        transfer_code: "TRF_1",
        reason: "Insufficient balance",
      }).event,
    ).toEqual({
      type: "transfer.failed",
      transferCode: "TRF_1",
      detail: "Insufficient balance",
    });
    expect(parse("subscription.create", {}).event).toEqual({
      type: "ignored",
      eventName: "subscription.create",
    });
    // Same payload -> same delivery id, so a redelivery is recognised.
    expect(
      parse("charge.success", { reference: "PSK-1", id: 42 }).eventId,
    ).toBe(parse("charge.success", { reference: "PSK-1", id: 42 }).eventId);
  });
});

describe("stripe adapter", () => {
  const stripe = account({
    provider: "stripe",
    countryCode: "GB",
    settlementCurrency: "GBP",
    currencies: ["GBP", "EUR"],
  });

  it("reports what it cannot do so the UI never offers it", () => {
    const caps = stripeProvider.capabilities(stripe);
    expect(caps.savedCards).toBe(false);
    expect(caps.directMobileMoney).toBe(false);
    expect(caps.payouts).toBe(false);
    expect(caps.checkoutModes).toEqual(["redirect"]);
    expect(stripeProvider.supportsMethod(stripe, "mobile_money", "GBP")).toBe(
      false,
    );
    expect(stripeProvider.supportsMethod(stripe, "card", "GBP")).toBe(true);
    expect(stripeProvider.supportsMethod(stripe, "card", "GHS")).toBe(false);
    expect(stripeProvider.cardVerificationAmount(stripe, "GBP")).toBeNull();
  });

  const signStripe = (
    body: string,
    secret = "whsec_x",
    t = Math.floor(Date.now() / 1000),
  ) =>
    new Headers({
      "stripe-signature": `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`,
    });

  it("verifies Stripe-Signature with the account's secret and rejects stale timestamps", () => {
    const body = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_1", payment_intent: "pi_1", payment_status: "paid" },
      },
    });
    const ok = stripeProvider.parseWebhook(stripe, body, signStripe(body));
    expect(ok).toMatchObject({
      ok: true,
      eventId: "evt_1",
      event: {
        type: "payment.succeeded",
        reference: "cs_1",
        providerTransactionId: "pi_1",
      },
    });
    expect(
      stripeProvider.parseWebhook(stripe, body, signStripe(body, "other")),
    ).toEqual({ ok: false, reason: "invalid_signature" });
    expect(
      stripeProvider.parseWebhook(
        stripe,
        body,
        signStripe(body, "whsec_x", Math.floor(Date.now() / 1000) - 3600),
      ),
    ).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
    expect(stripeProvider.parseWebhook(stripe, body, new Headers())).toEqual({
      ok: false,
      reason: "missing_signature",
    });
  });

  it("normalises refunds and disputes with amounts in the charge currency", () => {
    const parse = (type: string, object: Record<string, unknown>) => {
      const body = JSON.stringify({
        id: `evt_${type}`,
        type,
        data: { object },
      });
      const parsed = stripeProvider.parseWebhook(
        stripe,
        body,
        signStripe(body),
      );
      if (!parsed.ok) throw new Error(parsed.reason);
      return parsed.event;
    };
    expect(
      parse("charge.refunded", {
        payment_intent: "pi_1",
        amount_refunded: 1250,
        currency: "gbp",
      }),
    ).toEqual({
      type: "refund.processed",
      reference: null,
      providerTransactionId: "pi_1",
      amount: money(1250, "GBP"),
    });
    expect(
      parse("charge.dispute.created", {
        id: "dp_1",
        payment_intent: { id: "pi_1" },
        amount: 1250,
        currency: "gbp",
        status: "needs_response",
      }),
    ).toMatchObject({
      type: "dispute.opened",
      disputeId: "dp_1",
      providerTransactionId: "pi_1",
      amount: money(1250, "GBP"),
      status: "needs_response",
    });
    expect(parse("charge.refund.updated", { status: "succeeded" })).toEqual({
      type: "ignored",
      eventName: "charge.refund.updated",
    });
    expect(
      parse("checkout.session.expired", { id: "cs_2", payment_intent: null }),
    ).toEqual({
      type: "payment.failed",
      reference: "cs_2",
      providerTransactionId: null,
      detail: "checkout.session.expired",
    });
  });
});

describe("provider variable names", () => {
  const gh = { countryCode: "GH", isDefault: true, currency: "GHS" };
  const ng = { countryCode: "NG", isDefault: false, currency: "NGN" };
  const fr = { countryCode: "FR", isDefault: false, currency: "EUR" };

  it("accepts the seeded names", () => {
    expect(
      providerEnvNameProblem(
        "paystack",
        "secretKey",
        "PAYSTACK_SECRET_KEY",
        gh,
      ),
    ).toBeNull();
    expect(
      providerEnvNameProblem(
        "paystack",
        "publicKey",
        "NEXT_PUBLIC_PAYSTACK_NG_PUBLIC_KEY",
        ng,
      ),
    ).toBeNull();
    expect(
      providerEnvNameProblem("stripe", "secretKey", "STRIPE_SECRET_KEY_EU", fr),
    ).toBeNull();
  });

  it("refuses any other server secret, whatever the field", () => {
    for (const name of [
      "SUPABASE_SERVICE_ROLE_KEY",
      "CLOUDINARY_API_SECRET",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]) {
      expect(
        providerEnvNameProblem("paystack", "publicKey", name),
      ).not.toBeNull();
      expect(
        providerEnvNameProblem("stripe", "secretKey", name),
      ).not.toBeNull();
    }
  });

  it("refuses another market's keys", () => {
    expect(
      providerEnvNameProblem(
        "paystack",
        "secretKey",
        "PAYSTACK_SECRET_KEY",
        ng,
      ),
    ).not.toBeNull();
    expect(
      providerEnvNameProblem(
        "paystack",
        "secretKey",
        "PAYSTACK_KE_SECRET_KEY",
        ng,
      ),
    ).not.toBeNull();
  });

  it("an account pointed at a foreign secret is not built at all", () => {
    const market = { countryCode: "GH" } as never;
    const account = accountFromConfig(
      market,
      {
        provider: "paystack",
        enabled: true,
        credentials: {
          secretKeyEnv: "PAYSTACK_SECRET_KEY",
          webhookSecretEnv: "PAYSTACK_WEBHOOK_SECRET",
          publicKeyEnv: "SUPABASE_SERVICE_ROLE_KEY",
        },
        settlementCurrency: "GHS",
        priority: 1,
        providerAccountRef: null,
        currencies: ["GHS"],
        payoutsEnabled: false,
        options: {},
      },
      {
        PAYSTACK_SECRET_KEY: "sk_test_x",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      },
    );
    expect(account).toBeNull();
  });
});
