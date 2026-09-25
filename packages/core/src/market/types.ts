// The market model: everything that makes Abonten feel local in one
// country, as configuration. A market is a row in the `market` table plus
// its providers, payment methods, payout methods and regions. Nothing in
// application code branches on "GH"; it reads the market.
//
// Statuses (see transitions.ts):
//   draft        configured but not live; invisible to the public
//   preparing    infrastructure being validated (readiness checks run)
//   ready        every critical check passes; can be activated
//   live         people can browse, buy, sell and get paid
//   paused       temporarily disabled (nothing new; existing data readable)
//   maintenance  temporarily restricted (read-only for the public)

import type { AddressSchema } from "../geo/addressSchema";
import type { DistanceUnit } from "../units/distance";

export type MarketStatus =
  | "draft"
  | "preparing"
  | "ready"
  | "live"
  | "paused"
  | "maintenance";

export const MARKET_STATUSES: readonly MarketStatus[] = [
  "draft",
  "preparing",
  "ready",
  "live",
  "paused",
  "maintenance",
];

/** Payment providers the platform has an adapter for. */
export type PaymentProviderCode = "paystack" | "stripe";

export const PAYMENT_PROVIDER_CODES: readonly PaymentProviderCode[] = [
  "paystack",
  "stripe",
];

/** How a customer pays. The codes are ours; providers map onto them. */
export type PaymentMethodCode =
  | "card"
  | "mobile_money"
  | "bank_transfer"
  | "bank_redirect"
  | "apple_pay"
  | "google_pay"
  | "ussd"
  | "qr"
  | "eft"
  | "wallet";

export const PAYMENT_METHOD_CODES: readonly PaymentMethodCode[] = [
  "card",
  "mobile_money",
  "bank_transfer",
  "bank_redirect",
  "apple_pay",
  "google_pay",
  "ussd",
  "qr",
  "eft",
  "wallet",
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodCode, string> = {
  card: "Card",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank transfer",
  bank_redirect: "Pay by bank",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  ussd: "USSD",
  qr: "QR code",
  eft: "Instant EFT",
  wallet: "Wallet",
};

/** How an organizer receives a payout. */
export type PayoutMethodCode = "mobile_money" | "bank";

export type ClientPlatform = "web" | "ios" | "android";

export type OtpProviderCode = "hubtel" | "twilio";

export type TaxMode = "none" | "inclusive" | "exclusive";

export type TaxConfig = {
  mode: TaxMode;
  /** Rate in basis points (1250 = 12.5%). 0 when mode is "none". */
  rateBps: number;
  /** "VAT", "GST", "Sales tax" — what the receipt calls it. */
  label: string;
  /** Free text the admin records (registration number, legal basis). */
  note?: string | null;
  /** When an administrator confirmed this configuration with counsel. */
  acknowledgedAt?: string | null;
};

export const NO_TAX: TaxConfig = { mode: "none", rateBps: 0, label: "" };

export type MarketFeeConfig = {
  /** Customer-paid service fee override for this market, or null for the global rate. */
  serviceFeeBps: number | null;
};

export type MarketLegalConfig = {
  termsVersion?: string | null;
  privacyVersion?: string | null;
  /** The admin confirmed the legal review for this market is done. */
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  supportEmail?: string | null;
};

export type MarketPaymentProvider = {
  provider: PaymentProviderCode;
  enabled: boolean;
  /**
   * Names of the environment variables holding this provider account's
   * secrets (never the values). Ghana keeps the original names so nothing
   * changes for the first market.
   */
  credentials: {
    secretKeyEnv: string;
    webhookSecretEnv: string;
    publicKeyEnv?: string | null;
  };
  /** The currency this provider account settles to Abonten in. */
  settlementCurrency: string;
  /** Lower number wins when several providers accept a currency. */
  priority: number;
  /** Provider-side account id for reference (business id, acct_...). */
  providerAccountRef?: string | null;
  /** The provider's own list of accepted currencies for this account. */
  currencies: string[];
  /** Is the provider allowed to move money out (payouts) for this market? */
  payoutsEnabled: boolean;
};

export type MarketPaymentMethod = {
  method: PaymentMethodCode;
  provider: PaymentProviderCode;
  enabled: boolean;
  currencies: string[];
  /** Restrict to platforms (Apple Pay is iOS/web only). Empty = all. */
  platforms: ClientPlatform[];
  /** Shown first in the picker. */
  recommended: boolean;
  label?: string | null;
  /** Provider-specific channel names ("mobile_money", "card", "eft"). */
  providerChannels: string[];
  sortOrder: number;
};

export type PayoutFieldRule = {
  key: string;
  label: string;
  required: boolean;
  pattern?: string;
  example?: string;
};

export type MarketPayoutMethod = {
  method: PayoutMethodCode;
  provider: PaymentProviderCode | null;
  enabled: boolean;
  currency: string;
  /** The account fields this rail needs (sort code, routing number, IBAN…). */
  fields: PayoutFieldRule[];
  /** Whether the provider can execute the transfer or it is done by hand. */
  automated: boolean;
  label?: string | null;
};

export type MarketRegion = {
  id: string;
  slug: string;
  name: string;
  kind: "city" | "region";
  lat: number;
  lng: number;
  radiusKm: number;
  status: "active" | "inactive";
  position: number;
};

export type MarketConfig = {
  countryCode: string;
  name: string;
  status: MarketStatus;
  defaultCurrency: string;
  supportedCurrencies: string[];
  defaultTimeZone: string;
  defaultLocale: string;
  supportedLocales: string[];
  distanceUnit: DistanceUnit;
  dialCode: string;
  addressSchema: AddressSchema | null;
  tax: TaxConfig;
  fees: MarketFeeConfig;
  otpProvider: OtpProviderCode | null;
  legal: MarketLegalConfig;
  /** Fallback map centre when the person's location is unknown. */
  centre: { lat: number; lng: number } | null;
  launchedAt: string | null;
  version: number;
  paymentProviders: MarketPaymentProvider[];
  paymentMethods: MarketPaymentMethod[];
  payoutMethods: MarketPayoutMethod[];
  regions: MarketRegion[];
};

/**
 * What a client needs to feel local: the public, safe subset of a market
 * (no credential names, no legal notes). Served by the markets API.
 */
export type PublicMarket = {
  countryCode: string;
  name: string;
  status: MarketStatus;
  defaultCurrency: string;
  supportedCurrencies: string[];
  defaultTimeZone: string;
  defaultLocale: string;
  supportedLocales: string[];
  distanceUnit: DistanceUnit;
  dialCode: string;
  addressSchema: AddressSchema | null;
  tax: Pick<TaxConfig, "mode" | "rateBps" | "label">;
  centre: { lat: number; lng: number } | null;
  paymentMethods: Pick<
    MarketPaymentMethod,
    "method" | "provider" | "currencies" | "platforms" | "recommended" | "label"
  >[];
  payoutMethods: Pick<
    MarketPayoutMethod,
    "method" | "currency" | "fields" | "label"
  >[];
  regions: MarketRegion[];
};

export function toPublicMarket(m: MarketConfig): PublicMarket {
  return {
    countryCode: m.countryCode,
    name: m.name,
    status: m.status,
    defaultCurrency: m.defaultCurrency,
    supportedCurrencies: m.supportedCurrencies,
    defaultTimeZone: m.defaultTimeZone,
    defaultLocale: m.defaultLocale,
    supportedLocales: m.supportedLocales,
    distanceUnit: m.distanceUnit,
    dialCode: m.dialCode,
    addressSchema: m.addressSchema,
    tax: { mode: m.tax.mode, rateBps: m.tax.rateBps, label: m.tax.label },
    centre: m.centre,
    paymentMethods: m.paymentMethods
      .filter((pm) => pm.enabled)
      .map((pm) => ({
        method: pm.method,
        provider: pm.provider,
        currencies: pm.currencies,
        platforms: pm.platforms,
        recommended: pm.recommended,
        label: pm.label ?? null,
      })),
    payoutMethods: m.payoutMethods
      .filter((pm) => pm.enabled)
      .map((pm) => ({
        method: pm.method,
        currency: pm.currency,
        fields: pm.fields,
        label: pm.label ?? null,
      })),
    regions: m.regions.filter((r) => r.status === "active"),
  };
}

/** Markets the public may use: live, or maintenance (read-only). */
export function isMarketOpen(status: MarketStatus): boolean {
  return status === "live" || status === "maintenance";
}

/** Markets where new sales, sign-ups and listings are accepted. */
export function isMarketTransacting(status: MarketStatus): boolean {
  return status === "live";
}
