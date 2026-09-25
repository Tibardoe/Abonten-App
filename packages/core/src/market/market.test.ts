import { describe, expect, it } from "vitest";
import { money } from "../money/money";
import { resolveLocaleContext } from "./context";
import { computeOrderTotals, rateToBps } from "./pricing";
import { type ReadinessProbes, evaluateReadiness } from "./readiness";
import { availableTransitions, canTransition } from "./transitions";
import { type MarketConfig, type PublicMarket, toPublicMarket } from "./types";

const ghana: MarketConfig = {
  countryCode: "GH",
  name: "Ghana",
  status: "live",
  defaultCurrency: "GHS",
  supportedCurrencies: ["GHS"],
  defaultTimeZone: "Africa/Accra",
  defaultLocale: "en-GH",
  supportedLocales: ["en-GH", "en"],
  distanceUnit: "km",
  dialCode: "+233",
  addressSchema: null,
  tax: { mode: "none", rateBps: 0, label: "" },
  fees: { serviceFeeBps: null },
  otpProvider: "hubtel",
  legal: {
    acknowledgedAt: "2026-09-24T00:00:00Z",
    supportEmail: "support@abontenhub.com",
  },
  centre: { lat: 5.6037, lng: -0.187 },
  priceScale: 1,
  launchedAt: "2026-01-01T00:00:00Z",
  version: 1,
  paymentProviders: [
    {
      provider: "paystack",
      enabled: true,
      credentials: {
        secretKeyEnv: "PAYSTACK_SECRET_KEY",
        webhookSecretEnv: "PAYSTACK_WEBHOOK_SECRET",
        publicKeyEnv: "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
      },
      settlementCurrency: "GHS",
      priority: 1,
      currencies: ["GHS", "USD"],
      payoutsEnabled: false,
      options: {},
    },
  ],
  paymentMethods: [
    {
      method: "mobile_money",
      provider: "paystack",
      enabled: true,
      currencies: ["GHS"],
      platforms: [],
      recommended: true,
      providerChannels: ["mobile_money"],
      sortOrder: 1,
    },
    {
      method: "card",
      provider: "paystack",
      enabled: true,
      currencies: ["GHS", "USD"],
      platforms: [],
      recommended: false,
      providerChannels: ["card"],
      sortOrder: 2,
    },
  ],
  payoutMethods: [
    {
      method: "mobile_money",
      provider: "paystack",
      enabled: true,
      currency: "GHS",
      fields: [],
      automated: false,
    },
    {
      method: "bank",
      provider: "paystack",
      enabled: true,
      currency: "GHS",
      fields: [],
      automated: false,
    },
  ],
  regions: [],
};

const probesOk: ReadinessProbes = {
  providers: [
    {
      provider: "paystack",
      credentialsPresent: true,
      missingEnv: [],
      reachable: true,
      payoutsCapable: true,
      refundsCapable: true,
    },
  ],
  exchangeRateAvailable: true,
  exchangeRateAgeHours: 2,
  otherMarketCurrencies: ["GHS"],
  defaultMarketCurrency: "GHS",
  otpProviderConfigured: true,
  emailConfigured: true,
  monitoringActive: true,
  feeRateResolves: true,
  adminAccessVerified: true,
  notificationsConfigured: true,
};

describe("readiness", () => {
  it("passes a fully configured market", () => {
    const r = evaluateReadiness(ghana, probesOk);
    expect(r.canActivate).toBe(true);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("blocks activation on a critical failure and only warns on soft ones", () => {
    const noCreds = evaluateReadiness(ghana, {
      ...probesOk,
      providers: [
        {
          provider: "paystack",
          credentialsPresent: false,
          missingEnv: ["PAYSTACK_NG_SECRET_KEY"],
          reachable: null,
          payoutsCapable: false,
          refundsCapable: true,
        },
      ],
    });
    expect(noCreds.canActivate).toBe(false);
    expect(
      noCreds.checks.find((c) => c.key === "provider:paystack")?.detail,
    ).toContain("PAYSTACK_NG_SECRET_KEY");

    const noSms = evaluateReadiness(ghana, {
      ...probesOk,
      otpProviderConfigured: false,
    });
    expect(noSms.canActivate).toBe(true);
    expect(noSms.checks.find((c) => c.key === "otp")?.status).toBe("warn");

    const noLegal = evaluateReadiness({ ...ghana, legal: {} }, probesOk);
    expect(noLegal.canActivate).toBe(false);

    const noPayouts = evaluateReadiness(
      { ...ghana, payoutMethods: [] },
      probesOk,
    );
    expect(noPayouts.checks.find((c) => c.key === "payouts")?.status).toBe(
      "fail",
    );

    const badCurrency = evaluateReadiness(
      { ...ghana, defaultCurrency: "NGN" },
      probesOk,
    );
    expect(badCurrency.checks.find((c) => c.key === "currency")?.status).toBe(
      "fail",
    );
    expect(
      badCurrency.checks.find((c) => c.key === "provider_currency")?.status,
    ).toBe("fail");

    const unacknowledgedTax = evaluateReadiness(
      { ...ghana, tax: { mode: "exclusive", rateBps: 1250, label: "VAT" } },
      probesOk,
    );
    expect(unacknowledgedTax.canActivate).toBe(false);
  });

  it("asks for an exchange rate only once another currency is in play", () => {
    const noRate = { ...probesOk, exchangeRateAvailable: false };
    const alone = evaluateReadiness(ghana, {
      ...noRate,
      otherMarketCurrencies: [],
    });
    expect(alone.checks.find((c) => c.key === "exchange_rates")?.status).toBe(
      "pass",
    );
    const beside = evaluateReadiness(ghana, {
      ...noRate,
      otherMarketCurrencies: ["NGN"],
    });
    expect(beside.checks.find((c) => c.key === "exchange_rates")?.status).toBe(
      "warn",
    );
    expect(beside.canActivate).toBe(true);
  });
});

describe("transitions", () => {
  it("follows the state machine", () => {
    expect(availableTransitions("draft")).toEqual(["prepare"]);
    expect(availableTransitions("live")).toEqual([
      "pause",
      "enter_maintenance",
    ]);
    expect(canTransition("ready", "activate")).toBe(true);
    expect(canTransition("draft", "activate")).toBe(false);
    expect(canTransition("paused", "resume")).toBe(true);
  });
});

describe("pricing", () => {
  it("matches the existing fee model when there is no tax", () => {
    const t = computeOrderTotals({
      subtotal: money(2400, "GHS"),
      serviceFeeBps: 500,
    });
    expect(t.serviceFee.amountMinor).toBe(120);
    expect(t.total.amountMinor).toBe(2520);
    expect(t.taxAdded.amountMinor).toBe(0);
    expect(rateToBps(0.05)).toBe(500);
  });

  it("applies discounts before the fee and never goes negative", () => {
    const t = computeOrderTotals({
      subtotal: money(2000, "GHS"),
      discount: money(500, "GHS"),
      serviceFeeBps: 500,
    });
    expect(t.net.amountMinor).toBe(1500);
    expect(t.serviceFee.amountMinor).toBe(75);
    expect(t.total.amountMinor).toBe(1575);
    const free = computeOrderTotals({
      subtotal: money(500, "GHS"),
      discount: money(900, "GHS"),
      serviceFeeBps: 500,
    });
    expect(free.total.amountMinor).toBe(0);
  });

  it("adds exclusive tax and derives inclusive tax", () => {
    const ex = computeOrderTotals({
      subtotal: money(10000, "GBP"),
      serviceFeeBps: 500,
      tax: { mode: "exclusive", rateBps: 2000, label: "VAT" },
    });
    expect(ex.taxAdded.amountMinor).toBe(2000);
    expect(ex.serviceFee.amountMinor).toBe(500);
    expect(ex.total.amountMinor).toBe(12500);
    const inc = computeOrderTotals({
      subtotal: money(12000, "GBP"),
      serviceFeeBps: 0,
      tax: { mode: "inclusive", rateBps: 2000, label: "VAT" },
    });
    expect(inc.taxIncluded.amountMinor).toBe(2000);
    expect(inc.total.amountMinor).toBe(12000);
  });
});

describe("locale context", () => {
  const gh = toPublicMarket(ghana);
  const ng: PublicMarket = {
    ...gh,
    countryCode: "NG",
    name: "Nigeria",
    defaultCurrency: "NGN",
    supportedCurrencies: ["NGN"],
    defaultTimeZone: "Africa/Lagos",
    defaultLocale: "en-NG",
    dialCode: "+234",
  };
  const gbDraft: PublicMarket = {
    ...gh,
    countryCode: "GB",
    status: "draft",
    defaultCurrency: "GBP",
  };
  const markets = [gh, ng, gbDraft];

  it("prefers the browsing area, then preferences, then the request, then the default", () => {
    expect(
      resolveLocaleContext({
        markets,
        defaultMarketCountry: "GH",
        browsingCountry: "NG",
        preferences: { countryCode: "GH" },
      }),
    ).toMatchObject({ marketCountry: "NG", source: "browsing" });
    expect(
      resolveLocaleContext({
        markets,
        defaultMarketCountry: "GH",
        preferences: { countryCode: "NG" },
      }),
    ).toMatchObject({ marketCountry: "NG", source: "preference" });
    expect(
      resolveLocaleContext({
        markets,
        defaultMarketCountry: "GH",
        requestCountry: "ng",
      }),
    ).toMatchObject({ marketCountry: "NG", source: "request" });
    expect(
      resolveLocaleContext({ markets, defaultMarketCountry: "GH" }),
    ).toMatchObject({
      marketCountry: "GH",
      source: "default",
      displayCurrency: "GHS",
    });
  });

  it("never resolves to a market that is not open", () => {
    const ctx = resolveLocaleContext({
      markets,
      defaultMarketCountry: "GH",
      browsingCountry: "GB",
      requestCountry: "GB",
    });
    expect(ctx.marketCountry).toBe("GH");
    expect(ctx.viewerCountry).toBe("GB");
    // GB is not open so there is no market currency for it; the default applies.
    expect(ctx.displayCurrency).toBe("GHS");
  });

  it("keeps a traveller's own currency for estimates", () => {
    const ctx = resolveLocaleContext({
      markets,
      defaultMarketCountry: "GH",
      browsingCountry: "NG",
      requestCountry: "GH",
    });
    expect(ctx.marketCountry).toBe("NG");
    expect(ctx.displayCurrency).toBe("GHS");
    const explicit = resolveLocaleContext({
      markets,
      defaultMarketCountry: "GH",
      browsingCountry: "NG",
      preferences: { displayCurrency: "usd", distanceUnit: "mi" },
    });
    expect(explicit.displayCurrency).toBe("USD");
    expect(explicit.distanceUnit).toBe("mi");
  });
});
