// Market readiness: the checks that must pass before a country goes live,
// as one pure function over the configuration plus the probe results the
// service gathered (does the provider answer with these credentials, is an
// exchange rate on file, is monitoring on). The admin sees this list; the
// activation transition refuses while any critical check fails.

import { isKnownCurrency } from "../money/currencies";
import { isValidTimeZone } from "../time/timeZone";
import type { MarketConfig } from "./types";

export type ReadinessStatus = "pass" | "warn" | "fail";

export type ReadinessCheck = {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  critical: boolean;
};

export type ReadinessReport = {
  checks: ReadinessCheck[];
  canActivate: boolean;
  ranAt: string;
};

export type ProviderProbe = {
  provider: string;
  /** All credential env variables named in the config are set. */
  credentialsPresent: boolean;
  missingEnv: string[];
  /** A live call with those credentials succeeded (null = not probed). */
  reachable: boolean | null;
  detail?: string;
  /** Whether the adapter can execute payouts for this account. */
  payoutsCapable: boolean;
  refundsCapable: boolean;
};

export type ReadinessProbes = {
  providers: ProviderProbe[];
  /** An exchange rate for the market's default currency is on file. */
  exchangeRateAvailable: boolean;
  exchangeRateAgeHours: number | null;
  /** Default currencies of the other markets people can see (live or maintenance). */
  otherMarketCurrencies: string[];
  /** An OTP/SMS provider is configured and its credentials are present. */
  otpProviderConfigured: boolean;
  otpProviderDetail?: string;
  /** Transactional email is configured. */
  emailConfigured: boolean;
  /** Health checks and error reporting are active for the deployment. */
  monitoringActive: boolean;
  /** A platform fee rate resolves for the default currency. */
  feeRateResolves: boolean;
  /** At least one active admin can manage markets. */
  adminAccessVerified: boolean;
  /** Push/notification delivery job is configured. */
  notificationsConfigured: boolean;
};

const check = (
  key: string,
  label: string,
  ok: boolean,
  detail: string,
  options: { critical?: boolean; warnOnly?: boolean } = {},
): ReadinessCheck => ({
  key,
  label,
  status: ok ? "pass" : options.warnOnly ? "warn" : "fail",
  detail,
  critical: options.critical ?? true,
});

export function evaluateReadiness(
  market: MarketConfig,
  probes: ReadinessProbes,
  now: Date = new Date(),
): ReadinessReport {
  const checks: ReadinessCheck[] = [];

  checks.push(
    check(
      "country",
      "Country configuration",
      /^[A-Z]{2}$/.test(market.countryCode) &&
        market.name.trim().length > 0 &&
        /^\+\d{1,4}$/.test(market.dialCode),
      `${market.countryCode} · ${market.name} · ${market.dialCode}`,
    ),
  );

  const currencyOk =
    isKnownCurrency(market.defaultCurrency) &&
    market.supportedCurrencies.length > 0 &&
    market.supportedCurrencies.includes(market.defaultCurrency) &&
    market.supportedCurrencies.every((c) => isKnownCurrency(c));
  checks.push(
    check(
      "currency",
      "Currency configuration",
      currencyOk,
      currencyOk
        ? `Default ${market.defaultCurrency}; supported ${market.supportedCurrencies.join(", ")}`
        : "Default currency must be a known ISO 4217 code and listed in the supported currencies.",
    ),
  );

  checks.push(
    check(
      "timezone",
      "Time zone and locale",
      isValidTimeZone(market.defaultTimeZone) &&
        market.supportedLocales.includes(market.defaultLocale),
      `${market.defaultTimeZone} · ${market.defaultLocale}`,
    ),
  );

  const enabledProviders = market.paymentProviders.filter((p) => p.enabled);
  const providerProbe = (code: string) =>
    probes.providers.find((p) => p.provider === code);
  const providerCoversDefault = enabledProviders.some((p) =>
    p.currencies.includes(market.defaultCurrency),
  );
  if (enabledProviders.length === 0) {
    checks.push(
      check(
        "provider",
        "Payment provider",
        false,
        "Enable at least one payment provider.",
      ),
    );
  } else {
    for (const p of enabledProviders) {
      const probe = providerProbe(p.provider);
      const credentialsOk = probe?.credentialsPresent ?? false;
      const reachable = probe?.reachable;
      checks.push(
        check(
          `provider:${p.provider}`,
          `Payment provider · ${p.provider}`,
          credentialsOk && reachable !== false,
          !credentialsOk
            ? `Missing environment variables: ${(probe?.missingEnv ?? [p.credentials.secretKeyEnv, p.credentials.webhookSecretEnv]).join(", ")}`
            : reachable === false
              ? `Credentials are set but the provider did not accept them${probe?.detail ? ` (${probe.detail})` : ""}.`
              : reachable === null
                ? "Credentials are set; live check not run."
                : `Credentials accepted; settles in ${p.settlementCurrency}.`,
        ),
      );
    }
    checks.push(
      check(
        "provider_currency",
        "Provider accepts the default currency",
        providerCoversDefault,
        providerCoversDefault
          ? `${market.defaultCurrency} is accepted by ${enabledProviders
              .filter((p) => p.currencies.includes(market.defaultCurrency))
              .map((p) => p.provider)
              .join(", ")}.`
          : `No enabled provider lists ${market.defaultCurrency}.`,
      ),
    );
  }

  const methods = market.paymentMethods.filter(
    (m) =>
      m.enabled &&
      enabledProviders.some((p) => p.provider === m.provider && p.enabled),
  );
  checks.push(
    check(
      "payment_methods",
      "Customer payment methods",
      methods.length > 0 &&
        methods.some((m) => m.currencies.includes(market.defaultCurrency)),
      methods.length > 0
        ? methods.map((m) => `${m.method} (${m.provider})`).join(", ")
        : "Enable at least one payment method on an enabled provider.",
    ),
  );

  const payoutMethods = market.payoutMethods.filter((m) => m.enabled);
  const payoutAutomated = payoutMethods.some((m) => m.automated);
  checks.push(
    check(
      "payouts",
      "Organizer payouts",
      payoutMethods.length > 0,
      payoutMethods.length === 0
        ? "Configure at least one payout method (organizers cannot be paid)."
        : payoutAutomated
          ? `${payoutMethods.map((m) => m.method).join(", ")} — provider transfers enabled.`
          : `${payoutMethods.map((m) => m.method).join(", ")} — settled by manual transfer, confirmed in Admin › Finance.`,
    ),
  );

  const refundsOk = enabledProviders.some(
    (p) => providerProbe(p.provider)?.refundsCapable,
  );
  checks.push(
    check(
      "refunds",
      "Refund capability",
      refundsOk,
      refundsOk
        ? "Provider supports refunds."
        : "No enabled provider reports refund support.",
    ),
  );

  checks.push(
    check(
      "phone",
      "Phone validation",
      /^\+\d{1,4}$/.test(market.dialCode),
      `Numbers validated with libphonenumber for ${market.countryCode} (${market.dialCode}).`,
    ),
  );

  checks.push(
    check(
      "address",
      "Address configuration",
      true,
      market.addressSchema
        ? "Market-specific address form."
        : "Built-in address rules for this country.",
      { critical: false },
    ),
  );

  const taxOk =
    market.tax.mode === "none" ||
    (market.tax.rateBps >= 0 &&
      market.tax.rateBps <= 10_000 &&
      market.tax.label.trim().length > 0 &&
      !!market.tax.acknowledgedAt);
  checks.push(
    check(
      "tax",
      "Tax configuration",
      taxOk,
      market.tax.mode === "none"
        ? "No tax applied (confirm with counsel)."
        : taxOk
          ? `${market.tax.label} ${market.tax.rateBps / 100}% (${market.tax.mode}), acknowledged.`
          : "A tax rate needs a label, a rate and an acknowledgement.",
    ),
  );

  checks.push(
    check(
      "fees",
      "Service fee",
      probes.feeRateResolves,
      probes.feeRateResolves
        ? market.fees.serviceFeeBps != null
          ? `Market rate ${market.fees.serviceFeeBps / 100}%.`
          : "Global platform fee rate applies."
        : "No platform fee rate resolves for the default currency.",
    ),
  );

  checks.push(
    check(
      "otp",
      "Phone sign-in (SMS)",
      probes.otpProviderConfigured,
      probes.otpProviderConfigured
        ? `${market.otpProvider ?? "default"} provider configured.`
        : (probes.otpProviderDetail ??
            "No SMS/OTP provider is configured for this market; phone sign-in will not work."),
      { warnOnly: true, critical: false },
    ),
  );

  checks.push(
    check(
      "email",
      "Transactional email",
      probes.emailConfigured,
      probes.emailConfigured
        ? "Email provider configured."
        : "RESEND_API_KEY is not set.",
      {
        warnOnly: true,
        critical: false,
      },
    ),
  );

  checks.push(
    check(
      "notifications",
      "Notifications",
      probes.notificationsConfigured,
      probes.notificationsConfigured
        ? "Delivery job configured."
        : "notification_delivery_config is missing a dispatch URL.",
      { warnOnly: true, critical: false },
    ),
  );

  // A rate matters once a price here can be shown to someone whose own
  // market uses another currency, or the market itself takes several.
  const fxNeeded =
    market.supportedCurrencies.length > 1 ||
    probes.otherMarketCurrencies.some((c) => c !== market.defaultCurrency);
  checks.push(
    check(
      "exchange_rates",
      "Exchange rates",
      probes.exchangeRateAvailable || !fxNeeded,
      probes.exchangeRateAvailable
        ? `Rate on file${probes.exchangeRateAgeHours != null ? ` (${Math.round(probes.exchangeRateAgeHours)} h old)` : ""}.`
        : "No rate for the default currency; cross-currency display will show canonical prices only.",
      { warnOnly: true, critical: false },
    ),
  );

  checks.push(
    check(
      "monitoring",
      "Monitoring",
      probes.monitoringActive,
      probes.monitoringActive
        ? "Health checks and error reporting active."
        : "Health checks are not running.",
      {
        warnOnly: true,
        critical: false,
      },
    ),
  );

  checks.push(
    check(
      "admin",
      "Admin access",
      probes.adminAccessVerified,
      probes.adminAccessVerified
        ? "An active administrator can manage markets."
        : "No administrator holds markets.manage.",
    ),
  );

  checks.push(
    check(
      "legal",
      "Legal configuration",
      !!market.legal.acknowledgedAt,
      market.legal.acknowledgedAt
        ? `Acknowledged ${market.legal.acknowledgedAt.slice(0, 10)}${market.legal.termsVersion ? ` · terms ${market.legal.termsVersion}` : ""}.`
        : "Legal review for this market has not been acknowledged.",
    ),
  );

  checks.push(
    check(
      "support",
      "Support configuration",
      !!market.legal.supportEmail,
      market.legal.supportEmail
        ? market.legal.supportEmail
        : "No support contact set for this market.",
      { warnOnly: true, critical: false },
    ),
  );

  const canActivate = checks.every((c) => !(c.critical && c.status === "fail"));
  return { checks, canActivate, ranAt: now.toISOString() };
}
