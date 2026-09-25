// Exchange rates for DISPLAY estimates ("≈ GH₵1,700" under a £100 ticket).
// Never used to price, charge or settle anything.
//
// Provider: Open Exchange Rates (openexchangerates.org) — 170 currencies
// including every African one Abonten targets, hourly updates, USD base on
// every plan. The `exchange_rate_config` row names the environment variable
// holding the app id and the refresh cadence; a pg_cron job asks the web
// app to refresh (run_exchange_rate_refresh -> /api/jobs/exchange-rates),
// and Admin › Markets › Exchange rates can refresh by hand or enter a rate
// manually (provider "manual"). Rates are read once a minute per process.

import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import type { RateTable } from "@abonten/core/money/conversion";
import { isKnownCurrency } from "@abonten/core/money/currencies";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

const CACHE_TTL_MS = 60_000;
let cache: { at: number; table: RateTable | null } | null = null;

export function invalidateRateCache(): void {
  cache = null;
}

export type ExchangeRateConfig = {
  provider: "openexchangerates" | "manual" | "off";
  base: string;
  appIdEnv: string;
  refreshUrl: string | null;
  refreshEvery: string;
  lastRefreshedAt: string | null;
  lastError: string | null;
};

export async function getExchangeRateConfig(): Promise<ExchangeRateConfig> {
  const { data, error } = await getSupabaseServiceClient()
    .from("exchange_rate_config")
    .select(
      "provider, base, app_id_env, refresh_url, refresh_every, last_refreshed_at, last_error",
    )
    .eq("id", true)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `exchange_rate_config unreadable: ${error?.message ?? "missing row"}`,
    );
  }
  return {
    provider: data.provider as ExchangeRateConfig["provider"],
    base: data.base,
    appIdEnv: data.app_id_env,
    refreshUrl: data.refresh_url,
    refreshEvery: String(data.refresh_every),
    lastRefreshedAt: data.last_refreshed_at,
    lastError: data.last_error,
  };
}

/** The whole table for the configured base, or null when nothing is on file. */
export async function getDisplayRateTable(): Promise<RateTable | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.table;
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("exchange_rate")
    .select("base, quote, rate, source, published_at");
  if (error) {
    logger.error(`exchangeRates: read failed (${error.message})`);
    return cache?.table ?? null;
  }
  if (!data || data.length === 0) {
    cache = { at: Date.now(), table: null };
    return null;
  }
  // One base per table; the config's base wins if rows ever mix.
  const base = data[0].base;
  const rows = data.filter((r) => r.base === base);
  const rates: Record<string, number> = {};
  let asOf = rows[0].published_at;
  for (const r of rows) {
    rates[r.quote] = Number(r.rate);
    if (r.published_at < asOf) asOf = r.published_at;
  }
  const table: RateTable = { base, rates, asOf, source: rows[0].source };
  cache = { at: Date.now(), table };
  return table;
}

export type RefreshResult =
  | { ok: true; count: number; publishedAt: string }
  | { ok: false; message: string };

/**
 * Fetches the latest rates from Open Exchange Rates and stores every
 * currency Abonten knows. A failure leaves the previous rates in place and
 * is recorded on the config row for the admin page.
 */
export async function refreshExchangeRates(): Promise<RefreshResult> {
  const supabase = getSupabaseServiceClient();
  const config = await getExchangeRateConfig();
  if (config.provider !== "openexchangerates") {
    return {
      ok: false,
      message: `Automatic refresh is off (provider: ${config.provider}).`,
    };
  }
  const appId = process.env[config.appIdEnv];
  if (!appId) {
    const message = `${config.appIdEnv} is not set`;
    await supabase
      .from("exchange_rate_config")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("id", true);
    return { ok: false, message };
  }
  try {
    const res = await fetchWithTimeout(
      `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}&base=${encodeURIComponent(config.base)}`,
      { timeoutMs: HTTP_TIMEOUTS.paystackRead },
    );
    const json = (await res.json()) as {
      timestamp?: number;
      base?: string;
      rates?: Record<string, number>;
      description?: string;
    };
    if (!res.ok || !json.rates || typeof json.timestamp !== "number") {
      throw new Error(json.description ?? `HTTP ${res.status}`);
    }
    const publishedAt = new Date(json.timestamp * 1000).toISOString();
    const base = (json.base ?? config.base).toUpperCase();
    const rows = Object.entries(json.rates)
      .filter(
        ([code, rate]) =>
          isKnownCurrency(code) && typeof rate === "number" && rate > 0,
      )
      .map(([quote, rate]) => ({
        base,
        quote,
        rate,
        source: "openexchangerates",
        published_at: publishedAt,
        fetched_at: new Date().toISOString(),
      }));
    const { error } = await supabase
      .from("exchange_rate")
      .upsert(rows, { onConflict: "base,quote" });
    if (error) throw new Error(error.message);
    await supabase
      .from("exchange_rate_config")
      .update({
        last_refreshed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    invalidateRateCache();
    return { ok: true, count: rows.length, publishedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`exchangeRates: refresh failed (${message})`);
    await supabase
      .from("exchange_rate_config")
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq("id", true);
    return { ok: false, message };
  }
}

/** An administrator's hand-entered rate (units of `quote` per 1 `base`). */
export async function setManualExchangeRate(input: {
  base: string;
  quote: string;
  rate: number;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isKnownCurrency(input.base) || !isKnownCurrency(input.quote)) {
    return { ok: false, message: "Unknown currency." };
  }
  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    return { ok: false, message: "Enter a rate greater than zero." };
  }
  const { error } = await getSupabaseServiceClient()
    .from("exchange_rate")
    .upsert(
      {
        base: input.base.toUpperCase(),
        quote: input.quote.toUpperCase(),
        rate: input.rate,
        source: `manual:${input.actorId}`,
        published_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "base,quote" },
    );
  if (error) return { ok: false, message: error.message };
  invalidateRateCache();
  return { ok: true };
}

/** Constant-time check of the cron job's refresh token. */
export async function isRefreshTokenValid(
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const { data } = await getSupabaseServiceClient()
    .from("exchange_rate_config")
    .select("token")
    .eq("id", true)
    .maybeSingle();
  const expected = data?.token;
  if (!expected || expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
