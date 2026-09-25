// Reading market configuration. The `market*` tables are service-role only;
// this module loads them once per process, keeps them for a minute, and
// hands out typed MarketConfig objects. Everything that needs to know "what
// is local here" — providers, payment methods, tax, fees, zones, regions —
// goes through these functions, never through a literal.

import type { AddressSchema } from "@abonten/core/geo/addressSchema";
import { logger } from "@abonten/core/logger";
import type {
  ClientPlatform,
  MarketConfig,
  MarketFeeConfig,
  MarketLegalConfig,
  MarketPaymentMethod,
  MarketPaymentProvider,
  MarketPayoutMethod,
  MarketRegion,
  MarketStatus,
  PaymentMethodCode,
  PaymentProviderCode,
  PublicMarket,
  TaxConfig,
} from "@abonten/core/market/types";
import {
  NO_TAX,
  isMarketOpen,
  toPublicMarket,
} from "@abonten/core/market/types";
import type { DistanceUnit } from "@abonten/core/units/distance";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

type MarketRow = Database["public"]["Tables"]["market"]["Row"];
type ProviderRow =
  Database["public"]["Tables"]["market_payment_provider"]["Row"];
type MethodRow = Database["public"]["Tables"]["market_payment_method"]["Row"];
type PayoutRow = Database["public"]["Tables"]["market_payout_method"]["Row"];
type RegionRow = Database["public"]["Tables"]["market_region"]["Row"];

const CACHE_TTL_MS = 60_000;

type Cache = {
  at: number;
  byCountry: Map<string, MarketConfig>;
  defaultCountry: string | null;
};
let cache: Cache | null = null;
let inflight: Promise<Cache> | null = null;

function asTax(value: unknown): TaxConfig {
  if (!value || typeof value !== "object") return NO_TAX;
  const v = value as Record<string, unknown>;
  const mode =
    v.mode === "inclusive" || v.mode === "exclusive" ? v.mode : "none";
  return {
    mode,
    rateBps: typeof v.rateBps === "number" ? v.rateBps : 0,
    label: typeof v.label === "string" ? v.label : "",
    note: typeof v.note === "string" ? v.note : null,
    acknowledgedAt:
      typeof v.acknowledgedAt === "string" ? v.acknowledgedAt : null,
  };
}

function asFees(value: unknown): MarketFeeConfig {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    serviceFeeBps: typeof v.serviceFeeBps === "number" ? v.serviceFeeBps : null,
  };
}

function asLegal(value: unknown): MarketLegalConfig {
  const v = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const str = (k: string) =>
    typeof v[k] === "string" ? (v[k] as string) : null;
  return {
    termsVersion: str("termsVersion"),
    privacyVersion: str("privacyVersion"),
    acknowledgedAt: str("acknowledgedAt"),
    acknowledgedBy: str("acknowledgedBy"),
    supportEmail: str("supportEmail"),
  };
}

function asFields(value: unknown): MarketPayoutMethod["fields"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      key: String(f.key ?? ""),
      label: String(f.label ?? ""),
      required: f.required === true,
      pattern: typeof f.pattern === "string" ? f.pattern : undefined,
      example: typeof f.example === "string" ? f.example : undefined,
    }))
    .filter((f) => f.key);
}

function buildMarket(
  m: MarketRow,
  providers: ProviderRow[],
  methods: MethodRow[],
  payouts: PayoutRow[],
  regions: RegionRow[],
): MarketConfig {
  return {
    countryCode: m.country_code,
    name: m.name,
    status: m.status as MarketStatus,
    defaultCurrency: m.default_currency,
    supportedCurrencies: m.supported_currencies ?? [],
    defaultTimeZone: m.default_timezone,
    defaultLocale: m.default_locale,
    supportedLocales: m.supported_locales ?? [],
    distanceUnit: (m.distance_unit as DistanceUnit) ?? "km",
    dialCode: m.dial_code,
    addressSchema: (m.address_schema as AddressSchema | null) ?? null,
    tax: asTax(m.tax_config),
    fees: asFees(m.fee_config),
    otpProvider: (m.otp_provider as MarketConfig["otpProvider"]) ?? null,
    legal: asLegal(m.legal_config),
    centre:
      m.centre_lat != null && m.centre_lng != null
        ? { lat: m.centre_lat, lng: m.centre_lng }
        : null,
    launchedAt: m.launched_at,
    version: m.version,
    paymentProviders: providers
      .filter((p) => p.country_code === m.country_code)
      .map<MarketPaymentProvider>((p) => ({
        provider: p.provider as PaymentProviderCode,
        enabled: p.enabled,
        credentials: {
          secretKeyEnv: p.secret_key_env,
          webhookSecretEnv: p.webhook_secret_env,
          publicKeyEnv: p.public_key_env,
        },
        settlementCurrency: p.settlement_currency,
        priority: p.priority,
        providerAccountRef: p.provider_account_ref,
        currencies: p.currencies ?? [],
        payoutsEnabled: p.payouts_enabled,
        options:
          p.options &&
          typeof p.options === "object" &&
          !Array.isArray(p.options)
            ? (p.options as Record<string, unknown>)
            : {},
      }))
      .sort((a, b) => a.priority - b.priority),
    paymentMethods: methods
      .filter((x) => x.country_code === m.country_code)
      .map<MarketPaymentMethod>((x) => ({
        method: x.method as PaymentMethodCode,
        provider: x.provider as PaymentProviderCode,
        enabled: x.enabled,
        currencies: x.currencies ?? [],
        platforms: (x.platforms ?? []) as ClientPlatform[],
        recommended: x.recommended,
        label: x.label,
        providerChannels: x.provider_channels ?? [],
        sortOrder: x.sort_order,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    payoutMethods: payouts
      .filter((x) => x.country_code === m.country_code)
      .map<MarketPayoutMethod>((x) => ({
        method: x.method as MarketPayoutMethod["method"],
        provider: (x.provider as PaymentProviderCode | null) ?? null,
        enabled: x.enabled,
        currency: x.currency,
        fields: asFields(x.fields),
        automated: x.automated,
        label: x.label,
      })),
    regions: regions
      .filter((r) => r.country_code === m.country_code)
      .map<MarketRegion>((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        kind: r.kind as MarketRegion["kind"],
        lat: r.centre_lat,
        lng: r.centre_lng,
        radiusKm: Number(r.radius_km),
        status: r.status as MarketRegion["status"],
        position: r.position,
      }))
      .sort((a, b) => a.position - b.position),
  };
}

async function load(client: SupabaseClient<Database>): Promise<Cache> {
  const [markets, providers, methods, payouts, regions] = await Promise.all([
    client.from("market").select("*").order("country_code"),
    client.from("market_payment_provider").select("*"),
    client.from("market_payment_method").select("*"),
    client.from("market_payout_method").select("*"),
    client.from("market_region").select("*"),
  ]);
  const failed = [markets, providers, methods, payouts, regions].find(
    (r) => r.error,
  );
  if (failed?.error) {
    throw new Error(
      `Failed loading market configuration: ${failed.error.message}`,
    );
  }
  const byCountry = new Map<string, MarketConfig>();
  let defaultCountry: string | null = null;
  for (const m of markets.data ?? []) {
    byCountry.set(
      m.country_code,
      buildMarket(
        m,
        providers.data ?? [],
        methods.data ?? [],
        payouts.data ?? [],
        regions.data ?? [],
      ),
    );
    if (m.is_default) defaultCountry = m.country_code;
  }
  return { at: Date.now(), byCountry, defaultCountry };
}

async function getCache(client?: SupabaseClient<Database>): Promise<Cache> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  if (!inflight) {
    inflight = load(client ?? getSupabaseServiceClient())
      .then((c) => {
        cache = c;
        return c;
      })
      .catch((error) => {
        // Serve the previous snapshot through a transient failure rather
        // than taking every request down; log so it is not silent.
        logger.error(
          `marketConfig: reload failed (${error instanceof Error ? error.message : String(error)})`,
        );
        if (cache) return cache;
        throw error;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drops the process cache (after an admin edit). */
export function invalidateMarketCache(): void {
  cache = null;
}

export async function listMarkets(): Promise<MarketConfig[]> {
  const c = await getCache();
  return [...c.byCountry.values()];
}

export async function getMarket(
  countryCode: string | null | undefined,
): Promise<MarketConfig | null> {
  if (!countryCode) return null;
  const c = await getCache();
  return c.byCountry.get(countryCode.toUpperCase()) ?? null;
}

export async function getDefaultMarket(): Promise<MarketConfig> {
  const c = await getCache();
  const m = c.defaultCountry ? c.byCountry.get(c.defaultCountry) : null;
  if (!m) throw new Error("No default market is configured");
  return m;
}

/** The market a row in `countryCode` belongs to, or the default market. */
export async function getMarketOrDefault(
  countryCode: string | null | undefined,
): Promise<MarketConfig> {
  return (await getMarket(countryCode)) ?? getDefaultMarket();
}

/** The markets the public may see (live and maintenance). */
export async function listOpenMarkets(): Promise<MarketConfig[]> {
  return (await listMarkets()).filter((m) => isMarketOpen(m.status));
}

export async function listPublicMarkets(): Promise<PublicMarket[]> {
  return (await listOpenMarkets()).map(toPublicMarket);
}

/**
 * The market's customer-paid service fee in basis points, when it overrides
 * the global platform rate; null means use `get_active_platform_fee_rate`.
 */
export function marketServiceFeeBps(market: MarketConfig): number | null {
  return market.fees.serviceFeeBps;
}
