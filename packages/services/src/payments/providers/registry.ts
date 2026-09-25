// Which provider account handles a payment: the market's enabled providers,
// in priority order, filtered by the currency being charged (and, when the
// caller cares, by the payment method). Credentials are read from the
// environment by the NAMES stored on the market row; a missing variable is
// a configuration error surfaced by the readiness check, never a fallback
// to another market's keys.

import type {
  MarketConfig,
  MarketPaymentProvider,
  PaymentMethodCode,
  PaymentProviderCode,
} from "@abonten/core/market/types";
import { getMarketOrDefault } from "../../markets/marketConfig";
import {
  type AccountModes,
  accountModeProblem,
  declaredPaymentsMode,
  keyMode,
} from "./keyMode";
import { paystackProvider } from "./paystackProvider";
import { stripeProvider } from "./stripeProvider";
import type { PaymentProvider, ProviderAccount } from "./types";

const PROVIDERS: Record<PaymentProviderCode, PaymentProvider> = {
  paystack: paystackProvider,
  stripe: stripeProvider,
};

export function getPaymentProvider(code: string): PaymentProvider {
  const p = PROVIDERS[code as PaymentProviderCode];
  if (!p) throw new Error(`Unknown payment provider: ${code}`);
  return p;
}

export function isPaymentProviderCode(
  code: unknown,
): code is PaymentProviderCode {
  return typeof code === "string" && code in PROVIDERS;
}

export type ProviderEnvField = "secretKey" | "webhookSecret" | "publicKey";

// The only variable names a provider row may point at. A market row stores
// variable NAMES that the server resolves at runtime, and the public key's
// value is sent to buyers' browsers and apps — so a free-form name let
// anyone with markets.manage point it at SUPABASE_SERVICE_ROLE_KEY (or any
// other server secret) and have it shipped to every checkout.
const ENV_FAMILIES: Record<
  PaymentProviderCode,
  Record<ProviderEnvField, RegExp>
> = {
  paystack: {
    secretKey: /^PAYSTACK(?:_([A-Z]{2}))?_SECRET_KEY$/,
    // Paystack signs webhooks with the secret key itself.
    webhookSecret: /^PAYSTACK(?:_([A-Z]{2}))?_(?:WEBHOOK_SECRET|SECRET_KEY)$/,
    publicKey: /^NEXT_PUBLIC_PAYSTACK(?:_([A-Z]{2}))?_PUBLIC_KEY$/,
  },
  stripe: {
    secretKey: /^STRIPE_SECRET_KEY(?:_([A-Z]{2}))?$/,
    webhookSecret: /^STRIPE_WEBHOOK_SECRET(?:_([A-Z]{2}))?$/,
    publicKey: /^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY(?:_([A-Z]{2}))?$/,
  },
};

/**
 * Whether `name` is a variable this provider's `field` may be read from.
 * With `market`, the name's country suffix must also be that market's (or
 * EU for a euro-area Stripe account); no suffix is the default market's own
 * account. Null when it is fine, else a reason.
 */
export function providerEnvNameProblem(
  provider: PaymentProviderCode,
  field: ProviderEnvField,
  name: string,
  market?: { countryCode: string; isDefault: boolean; currency: string },
): string | null {
  const family = ENV_FAMILIES[provider]?.[field];
  const match = family?.exec(name);
  if (!match) {
    const words = {
      secretKey: "secret key",
      webhookSecret: "webhook secret",
      publicKey: "public key",
    }[field];
    return `${name} is not a ${provider} ${words} variable.`;
  }
  if (!market) return null;
  const suffix = match[1] ?? null;
  if (suffix === null) {
    return market.isDefault
      ? null
      : `${name} belongs to the default market's account; use one named for ${market.countryCode}.`;
  }
  if (suffix === market.countryCode) return null;
  if (provider === "stripe" && suffix === "EU" && market.currency === "EUR") {
    return null;
  }
  return `${name} is named for another market (${suffix}).`;
}

/** The env variable names a provider account needs, and which are unset. */
export function missingProviderEnv(
  config: MarketPaymentProvider,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const names = [
    config.credentials.secretKeyEnv,
    config.credentials.webhookSecretEnv,
  ];
  return names.filter((n) => !env[n] || env[n]?.trim() === "");
}

/** The test/live mode of each key a provider row points at (never a value). */
export function accountModes(
  config: MarketPaymentProvider,
  env: Record<string, string | undefined> = process.env,
): AccountModes {
  const publicKeyEnv = config.credentials.publicKeyEnv;
  return {
    secretKey: keyMode(env[config.credentials.secretKeyEnv]),
    publicKey: keyMode(publicKeyEnv ? env[publicKeyEnv] : null),
    webhookSecret: keyMode(env[config.credentials.webhookSecretEnv]),
  };
}

/**
 * Why this provider row cannot be used on this deployment, or null: a
 * variable is missing, its keys mix test and live, they are not the mode
 * PAYMENTS_MODE declares, a live key sits on a non-production deployment,
 * or (Paystack) the webhook secret is not the secret key.
 */
export function accountProblem(
  config: MarketPaymentProvider,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const secretEnv = config.credentials.secretKeyEnv;
  const webhookEnv = config.credentials.webhookSecretEnv;
  if (!env[secretEnv]?.trim()) {
    return `missing ${secretEnv}`;
  }
  const problem = accountModeProblem(
    accountModes(config, env),
    declaredPaymentsMode(env),
    {
      webhookSecretIsKey: config.provider === "paystack",
      deploymentEnv: env.VERCEL_ENV?.trim() || null,
    },
  );
  if (problem) return problem;
  // Paystack signs every webhook with the account's secret key — there is
  // no separate webhook secret. A different value here (an old key, a typo)
  // would refuse every live webhook while payments still went through.
  if (
    config.provider === "paystack" &&
    webhookEnv !== secretEnv &&
    env[webhookEnv]?.trim() &&
    env[webhookEnv]?.trim() !== env[secretEnv]?.trim()
  ) {
    return `${webhookEnv} must hold the same value as ${secretEnv} (Paystack signs webhooks with the secret key)`;
  }
  return null;
}

/**
 * Builds the account from a market's provider row, or null when its secret
 * key is not set, or its keys are not all one mode (see accountProblem) —
 * a half-finished switch from test to live keys stops payments rather than
 * charging on one account and verifying on the other. The webhook secret is only needed where webhooks are
 * received (the web deployment): without it the account can still charge,
 * verify and refund (the admin console), and every webhook for it is
 * refused as unsigned. Readiness still requires both before activation.
 */
export function accountFromConfig(
  market: MarketConfig,
  config: MarketPaymentProvider,
  env: Record<string, string | undefined> = process.env,
): ProviderAccount | null {
  // Refuse a row that points at anything but this provider's own
  // variables (see ENV_FAMILIES) — however the row was written.
  const names: [ProviderEnvField, string | null][] = [
    ["secretKey", config.credentials.secretKeyEnv],
    ["webhookSecret", config.credentials.webhookSecretEnv],
    ["publicKey", config.credentials.publicKeyEnv ?? null],
  ];
  for (const [field, name] of names) {
    if (name && providerEnvNameProblem(config.provider, field, name)) {
      return null;
    }
  }
  const secretKey = env[config.credentials.secretKeyEnv];
  const webhookSecret = env[config.credentials.webhookSecretEnv] ?? "";
  if (!secretKey) return null;
  if (accountProblem(config, env)) return null;
  const publicKeyEnv = config.credentials.publicKeyEnv;
  return {
    provider: config.provider,
    countryCode: market.countryCode,
    credentials: {
      secretKey,
      webhookSecret,
      publicKey: publicKeyEnv ? (env[publicKeyEnv] ?? null) : null,
    },
    settlementCurrency: config.settlementCurrency,
    currencies: config.currencies,
    payoutsEnabled: config.payoutsEnabled,
    accountRef: config.providerAccountRef ?? null,
    options: config.options ?? {},
  };
}

export type ResolvedProvider = {
  provider: PaymentProvider;
  account: ProviderAccount;
};

export class NoProviderError extends Error {
  constructor(
    public readonly countryCode: string,
    public readonly currency: string,
    detail: string,
  ) {
    super(detail);
    this.name = "NoProviderError";
  }
}

/**
 * The provider account that charges `currency` in `countryCode`'s market.
 * With `providerCode` (a stored attempt/transaction) that exact provider is
 * required. With `method`, only a provider whose adapter can run it counts.
 */
export async function resolveProviderAccount(input: {
  countryCode: string | null | undefined;
  currency: string;
  providerCode?: string | null;
  method?: PaymentMethodCode | null;
}): Promise<ResolvedProvider> {
  const market = await getMarketOrDefault(input.countryCode);
  const currency = input.currency.toUpperCase();
  const candidates = market.paymentProviders.filter(
    (p) =>
      p.enabled &&
      (!input.providerCode || p.provider === input.providerCode) &&
      p.currencies.map((c) => c.toUpperCase()).includes(currency),
  );
  const missing: string[] = [];
  const problems: string[] = [];
  for (const config of candidates) {
    const account = accountFromConfig(market, config);
    if (!account) {
      missing.push(...missingProviderEnv(config));
      const problem = accountProblem(config);
      if (problem && !problem.startsWith("missing ")) problems.push(problem);
      continue;
    }
    const provider = getPaymentProvider(config.provider);
    if (
      input.method &&
      !provider.supportsMethod(account, input.method, currency)
    )
      continue;
    return { provider, account };
  }
  throw new NoProviderError(
    market.countryCode,
    currency,
    problems.length > 0
      ? `Payment provider for ${market.countryCode} is refused: ${problems.join("; ")}`
      : missing.length > 0
        ? `Payment provider for ${market.countryCode} is not configured (missing ${missing.join(", ")})`
        : `No enabled payment provider accepts ${currency} in ${market.countryCode}${input.method ? ` for ${input.method}` : ""}`,
  );
}

/** Every configured account for a market, for the webhook router and readiness. */
export async function resolveMarketAccounts(countryCode: string): Promise<
  {
    config: MarketPaymentProvider;
    account: ProviderAccount | null;
    missingEnv: string[];
    modes: AccountModes;
    problem: string | null;
  }[]
> {
  const market = await getMarketOrDefault(countryCode);
  return market.paymentProviders.map((config) => ({
    config,
    account: accountFromConfig(market, config),
    missingEnv: missingProviderEnv(config),
    modes: accountModes(config),
    problem: accountProblem(config),
  }));
}
