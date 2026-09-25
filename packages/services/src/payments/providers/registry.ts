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

/**
 * Builds the account from a market's provider row, or null when its secret
 * key is not set. The webhook secret is only needed where webhooks are
 * received (the web deployment): without it the account can still charge,
 * verify and refund (the admin console), and every webhook for it is
 * refused as unsigned. Readiness still requires both before activation.
 */
export function accountFromConfig(
  market: MarketConfig,
  config: MarketPaymentProvider,
  env: Record<string, string | undefined> = process.env,
): ProviderAccount | null {
  const secretKey = env[config.credentials.secretKeyEnv];
  const webhookSecret = env[config.credentials.webhookSecretEnv] ?? "";
  if (!secretKey) return null;
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
  for (const config of candidates) {
    const account = accountFromConfig(market, config);
    if (!account) {
      missing.push(...missingProviderEnv(config));
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
    missing.length > 0
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
  }[]
> {
  const market = await getMarketOrDefault(countryCode);
  return market.paymentProviders.map((config) => ({
    config,
    account: accountFromConfig(market, config),
    missingEnv: missingProviderEnv(config),
  }));
}
