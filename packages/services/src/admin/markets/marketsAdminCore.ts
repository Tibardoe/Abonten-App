// Admin › Markets: configure a country, check it is ready, switch it on.
// Every function takes the service-role client and a resolved AdminContext,
// re-checks its permission, audits every write, and drops the process
// cache so the next request sees the change.
//
//   markets.view      read configuration, readiness reports, flags, rates
//   markets.manage    edit configuration, providers, methods, regions, flags
//   markets.activate  activate / pause / resume (step-up in the transport)

import type { FlagRules } from "@abonten/core/flags/evaluateFlag";
import { findCountry } from "@abonten/core/geo/countries";
import { countryDefaults } from "@abonten/core/geo/countryDefaults";
import { logger } from "@abonten/core/logger";
import {
  type ReadinessProbes,
  type ReadinessReport,
  evaluateReadiness,
} from "@abonten/core/market/readiness";
import {
  MARKET_TRANSITIONS,
  type MarketTransition,
} from "@abonten/core/market/transitions";
import type {
  MarketConfig,
  PaymentMethodCode,
  PaymentProviderCode,
} from "@abonten/core/market/types";
import { isKnownCurrency } from "@abonten/core/money/currencies";
import { isValidTimeZone } from "@abonten/core/time/timeZone";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Json } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { invalidateFeatureFlagCache } from "../../flags/featureFlagCore";
import {
  getDisplayRateTable,
  getExchangeRateConfig,
  refreshExchangeRates,
  setManualExchangeRate,
} from "../../fx/exchangeRateCore";
import {
  getMarket,
  invalidateMarketCache,
  listMarkets,
} from "../../markets/marketConfig";
import {
  getPaymentProvider,
  resolveMarketAccounts,
} from "../../payments/providers/registry";
import { getOtpProvider } from "../../profile/otpProviders/otpRouter";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

type Meta = Record<string, unknown> | undefined;

async function audit(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  action: string,
  countryCode: string,
  summary: string,
  extra: {
    reason?: string;
    after?: Record<string, unknown>;
    requestMeta?: Meta;
  } = {},
) {
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action,
    targetType: "market",
    targetId: countryCode,
    summary,
    reason: extra.reason,
    after: extra.after,
    requestMeta: { ...(extra.requestMeta ?? {}), roles: ctx.roles },
  });
}

// ── Read ───────────────────────────────────────────────────

export async function listMarketsAdminCore(
  _supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<MarketConfig[]>> {
  try {
    assertPermission(ctx, "markets.view");
    invalidateMarketCache();
    return { status: 200, data: await listMarkets() };
  } catch (e) {
    return adminError(e);
  }
}

export async function getMarketAdminCore(
  _supabase: ServiceRoleClient,
  ctx: AdminContext,
  countryCode: string,
): Promise<AdminEnvelope<MarketConfig>> {
  try {
    assertPermission(ctx, "markets.view");
    invalidateMarketCache();
    const market = await getMarket(countryCode);
    if (!market) return { status: 404, message: "Market not found" };
    return { status: 200, data: market };
  } catch (e) {
    return adminError(e);
  }
}

// ── Create / update ────────────────────────────────────────

export type CreateMarketInput = { countryCode: string; name?: string | null };

/** A new country in draft, pre-filled from the curated defaults. */
export async function createMarketAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: CreateMarketInput,
  requestMeta?: Meta,
): Promise<AdminEnvelope<{ countryCode: string }>> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.trim().toUpperCase();
    const country = findCountry(code);
    if (!country) return { status: 400, message: "Unknown country code." };
    if (await getMarket(code))
      return { status: 409, message: `${country.name} already has a market.` };
    const defaults = countryDefaults(code);
    const currency = defaults?.currency ?? null;
    if (!currency || !isKnownCurrency(currency)) {
      return {
        status: 400,
        message: `No default currency is known for ${country.name}; add it to the currency table first.`,
      };
    }
    const { error } = await supabase.from("market").insert({
      country_code: code,
      name: input.name?.trim() || country.name,
      status: "draft",
      default_currency: currency,
      supported_currencies: [currency],
      default_timezone: defaults?.timeZone ?? "UTC",
      default_locale: defaults?.locale ?? "en",
      supported_locales: [defaults?.locale ?? "en", "en"].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
      distance_unit: defaults?.distanceUnit ?? "km",
      dial_code: country.dialCode,
      updated_by: ctx.userId,
    });
    if (error) {
      logger.error(`createMarketAdminCore: ${error.message}`);
      return { status: 500, message: "Couldn't create the market." };
    }
    invalidateMarketCache();
    await audit(
      supabase,
      ctx,
      "markets.create",
      code,
      `Created market ${country.name} (draft)`,
      { requestMeta },
    );
    return { status: 200, data: { countryCode: code } };
  } catch (e) {
    return adminError(e);
  }
}

export type UpdateMarketInput = {
  countryCode: string;
  name?: string;
  defaultCurrency?: string;
  supportedCurrencies?: string[];
  defaultTimeZone?: string;
  defaultLocale?: string;
  supportedLocales?: string[];
  distanceUnit?: "km" | "mi";
  dialCode?: string;
  otpProvider?: "hubtel" | "twilio" | null;
  tax?: {
    mode: "none" | "inclusive" | "exclusive";
    rateBps: number;
    label: string;
    note?: string | null;
    acknowledge?: boolean;
  };
  serviceFeeBps?: number | null;
  legal?: {
    termsVersion?: string | null;
    privacyVersion?: string | null;
    supportEmail?: string | null;
    acknowledge?: boolean;
  };
  centre?: { lat: number; lng: number } | null;
  addressSchema?: Json | null;
};

export async function updateMarketAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpdateMarketInput,
  requestMeta?: Meta,
): Promise<AdminEnvelope<MarketConfig>> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    const current = await getMarket(code);
    if (!current) return { status: 404, message: "Market not found" };

    const patch: Record<string, unknown> = {
      updated_by: ctx.userId,
      version: current.version + 1,
    };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.defaultCurrency !== undefined) {
      if (!isKnownCurrency(input.defaultCurrency))
        return { status: 400, message: "Unknown currency." };
      patch.default_currency = input.defaultCurrency.toUpperCase();
    }
    if (input.supportedCurrencies !== undefined) {
      const list = input.supportedCurrencies.map((c) => c.toUpperCase());
      if (list.some((c) => !isKnownCurrency(c)))
        return {
          status: 400,
          message: "Unknown currency in the supported list.",
        };
      patch.supported_currencies = list;
    }
    const nextDefault =
      (patch.default_currency as string | undefined) ?? current.defaultCurrency;
    const nextSupported =
      (patch.supported_currencies as string[] | undefined) ??
      current.supportedCurrencies;
    if (!nextSupported.includes(nextDefault)) {
      return {
        status: 400,
        message:
          "The default currency must be one of the supported currencies.",
      };
    }
    if (input.defaultTimeZone !== undefined) {
      if (!isValidTimeZone(input.defaultTimeZone))
        return { status: 400, message: "Unknown time zone." };
      patch.default_timezone = input.defaultTimeZone;
    }
    if (input.defaultLocale !== undefined)
      patch.default_locale = input.defaultLocale;
    if (input.supportedLocales !== undefined)
      patch.supported_locales = input.supportedLocales;
    const nextLocale =
      (patch.default_locale as string | undefined) ?? current.defaultLocale;
    const nextLocales =
      (patch.supported_locales as string[] | undefined) ??
      current.supportedLocales;
    if (!nextLocales.includes(nextLocale)) {
      return {
        status: 400,
        message: "The default locale must be one of the supported locales.",
      };
    }
    if (input.distanceUnit !== undefined)
      patch.distance_unit = input.distanceUnit;
    if (input.dialCode !== undefined) {
      if (!/^\+\d{1,4}$/.test(input.dialCode))
        return { status: 400, message: "Dial code must look like +233." };
      patch.dial_code = input.dialCode;
    }
    if (input.otpProvider !== undefined) patch.otp_provider = input.otpProvider;
    if (input.tax !== undefined) {
      if (input.tax.rateBps < 0 || input.tax.rateBps > 10_000)
        return { status: 400, message: "Tax rate must be between 0 and 100%." };
      patch.tax_config = {
        mode: input.tax.mode,
        rateBps: input.tax.mode === "none" ? 0 : input.tax.rateBps,
        label: input.tax.label,
        note: input.tax.note ?? null,
        acknowledgedAt: input.tax.acknowledge
          ? new Date().toISOString()
          : (current.tax.acknowledgedAt ?? null),
      };
    }
    if (input.serviceFeeBps !== undefined) {
      if (
        input.serviceFeeBps !== null &&
        (input.serviceFeeBps < 0 || input.serviceFeeBps > 5000)
      ) {
        return {
          status: 400,
          message: "Service fee must be between 0 and 50%.",
        };
      }
      patch.fee_config = { serviceFeeBps: input.serviceFeeBps };
    }
    if (input.legal !== undefined) {
      patch.legal_config = {
        ...current.legal,
        termsVersion:
          input.legal.termsVersion ?? current.legal.termsVersion ?? null,
        privacyVersion:
          input.legal.privacyVersion ?? current.legal.privacyVersion ?? null,
        supportEmail:
          input.legal.supportEmail ?? current.legal.supportEmail ?? null,
        acknowledgedAt: input.legal.acknowledge
          ? new Date().toISOString()
          : (current.legal.acknowledgedAt ?? null),
        acknowledgedBy: input.legal.acknowledge
          ? ctx.userId
          : (current.legal.acknowledgedBy ?? null),
      };
    }
    if (input.centre !== undefined) {
      patch.centre_lat = input.centre?.lat ?? null;
      patch.centre_lng = input.centre?.lng ?? null;
    }
    if (input.addressSchema !== undefined)
      patch.address_schema = input.addressSchema;

    const { error } = await supabase
      .from("market")
      .update(patch as never)
      .eq("country_code", code);
    if (error) {
      logger.error(`updateMarketAdminCore: ${error.message}`);
      return { status: 500, message: error.message };
    }
    invalidateMarketCache();
    await audit(
      supabase,
      ctx,
      "markets.update",
      code,
      `Updated market ${code}`,
      {
        after: patch,
        requestMeta,
      },
    );
    const updated = await getMarket(code);
    const warning = await recheckOpenMarket(supabase, ctx, code);
    return updated
      ? { status: 200, data: updated, ...(warning ? { message: warning } : {}) }
      : { status: 500, message: "Reload failed" };
  } catch (e) {
    return adminError(e);
  }
}

// ── Providers, methods, payouts, regions ───────────────────

export type UpsertProviderInput = {
  countryCode: string;
  provider: PaymentProviderCode;
  enabled: boolean;
  secretKeyEnv: string;
  webhookSecretEnv: string;
  publicKeyEnv?: string | null;
  settlementCurrency: string;
  currencies: string[];
  priority?: number;
  payoutsEnabled: boolean;
  providerAccountRef?: string | null;
  /**
   * Provider facts for this account that differ by country (see
   * MarketPaymentProvider.options). Omitted = keep what is stored.
   */
  options?: Record<string, unknown> | null;
};

const ENV_NAME = /^[A-Z][A-Z0-9_]{2,80}$/;

/** Checks the provider options shape; returns a message when it is wrong. */
function providerOptionsProblem(options: unknown): string | null {
  if (options == null) return null;
  if (typeof options !== "object" || Array.isArray(options))
    return "Provider options must be a JSON object.";
  if (JSON.stringify(options).length > 4000)
    return "Provider options are too large.";
  const o = options as Record<string, unknown>;
  if (
    o.channels !== undefined &&
    !(
      Array.isArray(o.channels) &&
      o.channels.every((c) => typeof c === "string" && /^[a-z_]{2,32}$/.test(c))
    )
  )
    return "options.channels must be a list of provider channel names.";
  if (o.cardVerificationMinor !== undefined) {
    const v = o.cardVerificationMinor;
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      !Object.entries(v).every(
        ([k, n]) =>
          /^[A-Z]{3}$/.test(k) &&
          typeof n === "number" &&
          Number.isInteger(n) &&
          n > 0 &&
          n < 1_000_000,
      )
    )
      return "options.cardVerificationMinor must map currency codes to whole minor-unit amounts.";
  }
  if (o.bankCountry !== undefined && typeof o.bankCountry !== "string")
    return "options.bankCountry must be text.";
  return null;
}

/**
 * After a configuration change to a market people can use (live or
 * maintenance), check it again: a change that breaks a critical readiness
 * item on a live market is recorded and said out loud, so it cannot go
 * unnoticed. Returns the warning, or null when everything critical passes.
 */
async function recheckOpenMarket(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  code: string,
): Promise<string | null> {
  invalidateMarketCache();
  const market = await getMarket(code);
  if (!market || !["live", "maintenance"].includes(market.status)) return null;
  const report = await computeReadiness(supabase, market);
  await supabase.from("market_readiness_run").insert({
    country_code: market.countryCode,
    ran_by: ctx.userId,
    can_activate: report.canActivate,
    report: report as unknown as Json,
  });
  if (report.canActivate) return null;
  const failing = report.checks
    .filter((c) => c.critical && c.status === "fail")
    .map((c) => c.label);
  logger.error(
    `markets: ${market.countryCode} is ${market.status} and now fails readiness (${failing.join(", ")})`,
  );
  return `${market.name} is ${market.status} and now fails: ${failing.join(", ")}. Fix this, or pause the market.`;
}

function withLiveWarning(saved: string, warning: string | null): string {
  return warning ? `${saved} Warning — ${warning}` : saved;
}

export async function upsertProviderAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpsertProviderInput,
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    if (!(await getMarket(code)))
      return { status: 404, message: "Market not found" };
    if (
      !ENV_NAME.test(input.secretKeyEnv) ||
      !ENV_NAME.test(input.webhookSecretEnv) ||
      (input.publicKeyEnv && !ENV_NAME.test(input.publicKeyEnv))
    ) {
      return {
        status: 400,
        message:
          "Environment variable names must be UPPER_SNAKE_CASE (never values).",
      };
    }
    if (!isKnownCurrency(input.settlementCurrency))
      return { status: 400, message: "Unknown settlement currency." };
    const optionsProblem = providerOptionsProblem(input.options);
    if (optionsProblem) return { status: 400, message: optionsProblem };
    // Automated payouts move organizer money without a person in the loop:
    // only an adapter that can execute transfers may be switched to it, and
    // only by someone allowed to open markets (the action adds step-up).
    if (input.payoutsEnabled) {
      assertPermission(ctx, "markets.activate");
      const adapter = getPaymentProvider(input.provider);
      const canPayOut = adapter.capabilities({
        provider: input.provider,
        countryCode: code,
        credentials: { secretKey: "", webhookSecret: "", publicKey: null },
        settlementCurrency: input.settlementCurrency,
        currencies: input.currencies,
        payoutsEnabled: true,
        accountRef: null,
        options: input.options ?? {},
      }).payouts;
      if (!canPayOut) {
        return {
          status: 400,
          message: `${input.provider} can't send organizer payouts from Abonten yet; keep payouts manual.`,
        };
      }
    }
    const currencies = input.currencies.map((c) => c.toUpperCase());
    if (
      currencies.length === 0 ||
      currencies.some((c) => !isKnownCurrency(c))
    ) {
      return {
        status: 400,
        message: "List the currencies this provider account accepts.",
      };
    }
    const { error } = await supabase.from("market_payment_provider").upsert(
      {
        country_code: code,
        provider: input.provider,
        enabled: input.enabled,
        secret_key_env: input.secretKeyEnv,
        webhook_secret_env: input.webhookSecretEnv,
        public_key_env: input.publicKeyEnv ?? null,
        settlement_currency: input.settlementCurrency.toUpperCase(),
        currencies,
        priority: input.priority ?? 1,
        payouts_enabled: input.payoutsEnabled,
        provider_account_ref: input.providerAccountRef ?? null,
        ...(input.options != null ? { options: input.options as Json } : {}),
      },
      { onConflict: "country_code,provider" },
    );
    if (error) return { status: 500, message: error.message };
    invalidateMarketCache();
    await audit(
      supabase,
      ctx,
      "markets.provider.upsert",
      code,
      `${input.enabled ? "Enabled" : "Configured"} ${input.provider} for ${code}`,
      {
        after: {
          provider: input.provider,
          enabled: input.enabled,
          currencies,
          settlementCurrency: input.settlementCurrency,
          payoutsEnabled: input.payoutsEnabled,
        },
        requestMeta,
      },
    );
    return {
      status: 200,
      message: withLiveWarning(
        "Provider saved.",
        await recheckOpenMarket(supabase, ctx, code),
      ),
    };
  } catch (e) {
    return adminError(e);
  }
}

export type UpsertPaymentMethodInput = {
  countryCode: string;
  provider: PaymentProviderCode;
  method: PaymentMethodCode;
  enabled: boolean;
  currencies: string[];
  platforms: ("web" | "ios" | "android")[];
  recommended: boolean;
  label?: string | null;
  sortOrder?: number;
};

export async function upsertPaymentMethodAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpsertPaymentMethodInput,
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    const market = await getMarket(code);
    if (!market) return { status: 404, message: "Market not found" };
    const providerConfig = market.paymentProviders.find(
      (p) => p.provider === input.provider,
    );
    if (!providerConfig)
      return {
        status: 400,
        message: `Configure the ${input.provider} provider for ${code} first.`,
      };
    const currencies = input.currencies.map((c) => c.toUpperCase());
    if (currencies.some((c) => !isKnownCurrency(c)))
      return { status: 400, message: "Unknown currency." };
    if (input.enabled) {
      // The adapter must actually be able to run this method here.
      const provider = getPaymentProvider(input.provider);
      const probeAccount = {
        provider: input.provider,
        countryCode: code,
        credentials: { secretKey: "x", webhookSecret: "x", publicKey: null },
        settlementCurrency: providerConfig.settlementCurrency,
        currencies: providerConfig.currencies,
        payoutsEnabled: providerConfig.payoutsEnabled,
        accountRef: null,
        options: providerConfig.options ?? {},
      };
      if (
        !currencies.some((c) =>
          provider.supportsMethod(probeAccount, input.method, c),
        )
      ) {
        return {
          status: 400,
          message: `${input.provider} cannot run ${input.method} in ${code} for these currencies.`,
        };
      }
    }
    const { error } = await supabase.from("market_payment_method").upsert(
      {
        country_code: code,
        provider: input.provider,
        method: input.method,
        enabled: input.enabled,
        currencies,
        platforms: input.platforms,
        recommended: input.recommended,
        label: input.label ?? null,
        sort_order: input.sortOrder ?? 100,
      },
      { onConflict: "country_code,provider,method" },
    );
    if (error) return { status: 500, message: error.message };
    invalidateMarketCache();
    await audit(
      supabase,
      ctx,
      "markets.method.upsert",
      code,
      `${input.enabled ? "Enabled" : "Disabled"} ${input.method} via ${input.provider} in ${code}`,
      { requestMeta },
    );
    return {
      status: 200,
      message: withLiveWarning(
        "Payment method saved.",
        await recheckOpenMarket(supabase, ctx, code),
      ),
    };
  } catch (e) {
    return adminError(e);
  }
}

export type UpsertPayoutMethodInput = {
  countryCode: string;
  method: "mobile_money" | "bank";
  provider?: PaymentProviderCode | null;
  enabled: boolean;
  currency: string;
  automated: boolean;
  fields: {
    key: string;
    label: string;
    required: boolean;
    pattern?: string;
    example?: string;
  }[];
  label?: string | null;
};

export async function upsertPayoutMethodAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpsertPayoutMethodInput,
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    if (!(await getMarket(code)))
      return { status: 404, message: "Market not found" };
    if (!isKnownCurrency(input.currency))
      return { status: 400, message: "Unknown currency." };
    for (const f of input.fields) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{1,40}$/.test(f.key))
        return {
          status: 400,
          message: `Field key "${f.key}" must be a simple identifier.`,
        };
      if (f.pattern) {
        try {
          new RegExp(f.pattern);
        } catch {
          return {
            status: 400,
            message: `Field "${f.key}" has an invalid pattern.`,
          };
        }
      }
    }
    const { error } = await supabase.from("market_payout_method").upsert(
      {
        country_code: code,
        method: input.method,
        provider: input.provider ?? null,
        enabled: input.enabled,
        currency: input.currency.toUpperCase(),
        automated: input.automated,
        fields: input.fields as unknown as Json,
        label: input.label ?? null,
      },
      { onConflict: "country_code,method,currency" },
    );
    if (error) return { status: 500, message: error.message };
    invalidateMarketCache();
    await audit(
      supabase,
      ctx,
      "markets.payout.upsert",
      code,
      `${input.enabled ? "Enabled" : "Disabled"} ${input.method} payouts (${input.currency}) in ${code}`,
      { requestMeta },
    );
    return {
      status: 200,
      message: withLiveWarning(
        "Payout method saved.",
        await recheckOpenMarket(supabase, ctx, code),
      ),
    };
  } catch (e) {
    return adminError(e);
  }
}

export type UpsertRegionInput = {
  countryCode: string;
  id?: string | null;
  slug: string;
  name: string;
  kind: "city" | "region";
  lat: number;
  lng: number;
  radiusKm: number;
  timezone?: string | null;
  status: "active" | "inactive";
  position?: number;
};

export async function upsertRegionAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: UpsertRegionInput,
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    if (!(await getMarket(code)))
      return { status: 404, message: "Market not found" };
    if (!/^[a-z0-9-]{2,60}$/.test(input.slug))
      return {
        status: 400,
        message: "Slug must be lowercase letters, digits and dashes.",
      };
    if (input.timezone && !isValidTimeZone(input.timezone))
      return { status: 400, message: "Unknown time zone." };
    const row = {
      country_code: code,
      slug: input.slug,
      name: input.name.trim(),
      kind: input.kind,
      centre_lat: input.lat,
      centre_lng: input.lng,
      radius_km: input.radiusKm,
      timezone: input.timezone ?? null,
      status: input.status,
      position: input.position ?? 100,
    };
    const { error } = input.id
      ? await supabase
          .from("market_region")
          .update(row)
          .eq("id", input.id)
          .eq("country_code", code)
      : await supabase
          .from("market_region")
          .upsert(row, { onConflict: "country_code,slug" });
    if (error) return { status: 500, message: error.message };
    invalidateMarketCache();
    await audit(
      supabase,
      ctx,
      "markets.region.upsert",
      code,
      `Saved region ${input.name} (${code})`,
      { requestMeta },
    );
    return {
      status: 200,
      message: withLiveWarning(
        "Region saved.",
        await recheckOpenMarket(supabase, ctx, code),
      ),
    };
  } catch (e) {
    return adminError(e);
  }
}

// ── Readiness ──────────────────────────────────────────────

export async function runReadinessAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  countryCode: string,
  requestMeta?: Meta,
): Promise<AdminEnvelope<ReadinessReport>> {
  try {
    assertPermission(ctx, "markets.view");
    invalidateMarketCache();
    const market = await getMarket(countryCode);
    if (!market) return { status: 404, message: "Market not found" };
    const report = await computeReadiness(supabase, market);
    await supabase.from("market_readiness_run").insert({
      country_code: market.countryCode,
      ran_by: ctx.userId,
      can_activate: report.canActivate,
      report: report as unknown as Json,
    });
    await audit(
      supabase,
      ctx,
      "markets.readiness",
      market.countryCode,
      `Readiness ${report.canActivate ? "passed" : "failed"} for ${market.countryCode}`,
      { requestMeta },
    );
    return { status: 200, data: report };
  } catch (e) {
    return adminError(e);
  }
}

/** Live probes for every check the pure evaluator needs. */
async function computeReadiness(
  supabase: ServiceRoleClient,
  market: MarketConfig,
): Promise<ReadinessReport> {
  const accounts = await resolveMarketAccounts(market.countryCode);
  const providers: ReadinessProbes["providers"] = [];
  for (const entry of accounts) {
    if (!entry.config.enabled) continue;
    const provider = getPaymentProvider(entry.config.provider);
    if (!entry.account) {
      providers.push({
        provider: entry.config.provider,
        credentialsPresent: false,
        missingEnv: entry.missingEnv,
        reachable: null,
        payoutsCapable: false,
        refundsCapable: false,
      });
      continue;
    }
    const probe = await provider.probe(entry.account);
    const caps = provider.capabilities(entry.account);
    providers.push({
      provider: entry.config.provider,
      credentialsPresent: true,
      missingEnv: [],
      reachable: probe.reachable,
      detail: probe.detail,
      payoutsCapable: caps.payouts,
      refundsCapable: caps.refunds,
    });
  }

  const rates = await getDisplayRateTable();
  const rate =
    rates?.rates[market.defaultCurrency] ??
    (rates?.base === market.defaultCurrency ? 1 : undefined);
  const rateAgeHours = rates
    ? (Date.now() - new Date(rates.asOf).getTime()) / 3_600_000
    : null;

  const { data: others } = await supabase
    .from("market")
    .select("default_currency")
    .neq("country_code", market.countryCode)
    .in("status", ["live", "maintenance"]);

  const otp = market.otpProvider ? getOtpProvider(market.otpProvider) : null;

  const { data: feeRate } = await supabase.rpc("get_active_platform_fee_rate", {
    p_currency: market.defaultCurrency,
    p_country_code: market.countryCode,
  });

  const { data: obs } = await supabase
    .from("observability_config")
    .select("health_url, last_dispatched_at")
    .eq("id", true)
    .maybeSingle();
  const monitoringActive =
    !!obs?.health_url &&
    !!obs.last_dispatched_at &&
    Date.now() - new Date(obs.last_dispatched_at).getTime() < 15 * 60 * 1000;

  const { data: notif } = await supabase
    .from("notification_delivery_config")
    .select("dispatch_url")
    .eq("id", true)
    .maybeSingle();

  const { count: managers } = await supabase
    .from("admin_user_role")
    .select("user_id", { count: "exact", head: true })
    .in("role_key", ["super_admin", "operations"]);

  const probes: ReadinessProbes = {
    providers,
    exchangeRateAvailable: rate != null,
    exchangeRateAgeHours: rateAgeHours,
    otherMarketCurrencies: (others ?? []).map((m) => m.default_currency),
    otpProviderConfigured: !!otp && otp.isConfigured(),
    otpProviderDetail: otp
      ? `${otp.code} needs ${otp.requiredEnv().join(", ")}`
      : "No OTP provider is set for this market.",
    emailConfigured: !!process.env.RESEND_API_KEY,
    monitoringActive,
    feeRateResolves: feeRate != null || market.fees.serviceFeeBps != null,
    adminAccessVerified: (managers ?? 0) > 0,
    notificationsConfigured: !!notif?.dispatch_url,
  };
  return evaluateReadiness(market, probes);
}

// ── Transitions ────────────────────────────────────────────

export async function transitionMarketAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    countryCode: string;
    transition: MarketTransition;
    reason?: string | null;
  },
  requestMeta?: Meta,
): Promise<AdminEnvelope<{ status: string }>> {
  try {
    const rule = MARKET_TRANSITIONS[input.transition];
    if (!rule) return { status: 400, message: "Unknown transition." };
    assertPermission(ctx, rule.stepUp ? "markets.activate" : "markets.manage");
    invalidateMarketCache();
    const market = await getMarket(input.countryCode);
    if (!market) return { status: 404, message: "Market not found" };

    let readinessOk = false;
    if (rule.needsReadiness) {
      const report = await computeReadiness(supabase, market);
      await supabase.from("market_readiness_run").insert({
        country_code: market.countryCode,
        ran_by: ctx.userId,
        can_activate: report.canActivate,
        report: report as unknown as Json,
      });
      readinessOk = report.canActivate;
      if (!readinessOk) {
        const failing = report.checks
          .filter((c) => c.critical && c.status === "fail")
          .map((c) => c.label);
        return {
          status: 409,
          message: `Readiness checks failed: ${failing.join(", ")}.`,
        };
      }
    }

    const { data, error } = await supabase.rpc("market_transition", {
      p_country_code: market.countryCode,
      p_transition: input.transition,
      p_actor_id: ctx.userId,
      p_reason: input.reason ?? undefined,
      p_readiness_ok: readinessOk,
      // The readiness report above was computed on this version; an edit in
      // between makes the database refuse the change.
      p_expected_version: market.version,
    });
    if (error) {
      return {
        status: error.code === "23514" ? 409 : 500,
        message: error.message,
      };
    }
    invalidateMarketCache();
    const next = (data as { status?: string } | null)?.status ?? "unknown";
    await audit(
      supabase,
      ctx,
      `markets.${input.transition}`,
      market.countryCode,
      `${rule.label}: ${market.countryCode} ${market.status} → ${next}`,
      {
        reason: input.reason ?? undefined,
        requestMeta,
      },
    );
    return { status: 200, data: { status: next } };
  } catch (e) {
    return adminError(e);
  }
}

// ── Feature flags ──────────────────────────────────────────

export type FeatureFlagRow = {
  key: string;
  description: string;
  enabled: boolean;
  rules: FlagRules | null;
  updatedAt: string;
};

export async function listFeatureFlagsAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<FeatureFlagRow[]>> {
  try {
    assertPermission(ctx, "markets.view");
    const { data, error } = await supabase
      .from("feature_flag")
      .select("key, description, enabled, rules, updated_at")
      .order("key");
    if (error) return { status: 500, message: error.message };
    return {
      status: 200,
      data: (data ?? []).map((r) => ({
        key: r.key,
        description: r.description,
        enabled: r.enabled,
        rules: (r.rules as FlagRules | null) ?? null,
        updatedAt: r.updated_at,
      })),
    };
  } catch (e) {
    return adminError(e);
  }
}

export async function upsertFeatureFlagAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    key: string;
    description?: string;
    enabled: boolean;
    rules: FlagRules | null;
  },
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    if (!/^[a-z0-9_.-]{2,80}$/.test(input.key))
      return {
        status: 400,
        message:
          "Flag keys are lowercase letters, digits, dots, dashes and underscores.",
      };
    if (
      input.rules?.percent != null &&
      (input.rules.percent < 0 || input.rules.percent > 100)
    )
      return { status: 400, message: "Percent must be 0–100." };
    const { error } = await supabase.from("feature_flag").upsert(
      {
        key: input.key,
        description: input.description ?? "",
        enabled: input.enabled,
        rules: (input.rules as unknown as Json) ?? null,
        updated_at: new Date().toISOString(),
        updated_by: ctx.userId,
      },
      { onConflict: "key" },
    );
    if (error) return { status: 500, message: error.message };
    invalidateFeatureFlagCache();
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "markets.flag.upsert",
      targetType: "feature_flag",
      targetId: input.key,
      summary: `${input.enabled ? "Enabled" : "Disabled"} flag ${input.key}`,
      after: { enabled: input.enabled, rules: input.rules },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return { status: 200, message: "Flag saved." };
  } catch (e) {
    return adminError(e);
  }
}

// ── Exchange rates ─────────────────────────────────────────

export async function getExchangeRatesAdminCore(
  _supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<
  AdminEnvelope<{
    config: Awaited<ReturnType<typeof getExchangeRateConfig>>;
    table: Awaited<ReturnType<typeof getDisplayRateTable>>;
  }>
> {
  try {
    assertPermission(ctx, "markets.view");
    const [config, table] = await Promise.all([
      getExchangeRateConfig(),
      getDisplayRateTable(),
    ]);
    return { status: 200, data: { config, table } };
  } catch (e) {
    return adminError(e);
  }
}

export async function refreshExchangeRatesAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  requestMeta?: Meta,
): Promise<AdminEnvelope<{ count: number }>> {
  try {
    assertPermission(ctx, "markets.manage");
    const result = await refreshExchangeRates();
    if (!result.ok) return { status: 503, message: result.message };
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "markets.rates.refresh",
      targetType: "exchange_rate",
      summary: `Refreshed ${result.count} display rates (${result.publishedAt})`,
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return { status: 200, data: { count: result.count } };
  } catch (e) {
    return adminError(e);
  }
}

export async function setExchangeRateConfigAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    provider: "openexchangerates" | "manual" | "off";
    base?: string;
    appIdEnv?: string;
    refreshUrl?: string | null;
  },
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    if (input.base && !isKnownCurrency(input.base))
      return { status: 400, message: "Unknown base currency." };
    if (input.appIdEnv && !ENV_NAME.test(input.appIdEnv))
      return {
        status: 400,
        message: "The app id env name must be UPPER_SNAKE_CASE.",
      };
    const patch: Record<string, unknown> = {
      provider: input.provider,
      updated_at: new Date().toISOString(),
    };
    if (input.base) patch.base = input.base.toUpperCase();
    if (input.appIdEnv) patch.app_id_env = input.appIdEnv;
    if (input.refreshUrl !== undefined) patch.refresh_url = input.refreshUrl;
    const { error } = await supabase
      .from("exchange_rate_config")
      .update(patch as never)
      .eq("id", true);
    if (error) return { status: 500, message: error.message };
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "markets.rates.configure",
      targetType: "exchange_rate_config",
      summary: `Exchange-rate provider set to ${input.provider}`,
      after: patch,
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return { status: 200, message: "Exchange-rate settings saved." };
  } catch (e) {
    return adminError(e);
  }
}

export async function setManualExchangeRateAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { base: string; quote: string; rate: number },
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    const result = await setManualExchangeRate({
      ...input,
      actorId: ctx.userId,
    });
    if (!result.ok) return { status: 400, message: result.message };
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "markets.rates.manual",
      targetType: "exchange_rate",
      targetId: `${input.base}/${input.quote}`,
      summary: `Set ${input.base}→${input.quote} = ${input.rate} by hand`,
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return { status: 200, message: "Rate saved." };
  } catch (e) {
    return adminError(e);
  }
}
