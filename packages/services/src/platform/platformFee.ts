import type { Database } from "@abonten/types/database.types";
// The customer-paid Abonten service-fee rate, resolved from the
// platform_fee_config DB table via the get_active_platform_fee_rate RPC —
// the single source of truth, editable without a code deploy. Shared by the
// server-side checkout charge paths (createPaymentAttempt.ts,
// checkoutPaymentPreparation.ts) and, through getServiceFeeRate.ts, the
// client-side live preview. Not a "use server" file — same category as
// ticketInventory.ts/promoUsage.ts: it takes an already-constructed Supabase
// client rather than resolving a session of its own.

import { DEFAULT_SERVICE_FEE_RATE } from "@abonten/core/checkoutPricing";
import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarket } from "../markets/marketConfig";

/**
 * The rate a buyer in this market pays, with the same precedence the
 * checkout charges (checkoutPaymentPreparation) and record_platform_fee
 * record: the market's own service fee when it sets one, else the platform
 * rate for the currency and country. Previews use this too, so a market
 * with its own fee is never previewed at the platform default.
 */
// Previews (the market context asks for every market's rate on each app
// start) may use a minute's cache; the charge path never does, so a rate
// change applies to the next order at once.
const RATE_TTL_MS = 60_000;
const rateCache = new Map<string, { at: number; rate: number }>();

export async function serviceFeeRateFor(
  supabase: SupabaseClient<Database>,
  input: { currency?: string | null; countryCode?: string | null },
  options: { cached?: boolean } = {},
): Promise<number> {
  const market = input.countryCode ? await getMarket(input.countryCode) : null;
  if (market?.fees.serviceFeeBps != null) {
    return market.fees.serviceFeeBps / 10_000;
  }
  const key = `${input.countryCode ?? ""}|${input.currency ?? ""}`;
  const hit = options.cached ? rateCache.get(key) : undefined;
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return hit.rate;
  const rate = await getActiveServiceFeeRate(
    supabase,
    input.currency ?? null,
    input.countryCode ?? null,
  );
  rateCache.set(key, { at: Date.now(), rate });
  return rate;
}

/**
 * Returns the active service-fee rate (e.g. 0.05) for the given currency and
 * market (country + currency > country > currency > global),
 * falling back to DEFAULT_SERVICE_FEE_RATE if the config can't be read — so
 * a transient DB hiccup never silently charges a 0% fee.
 */
export async function getActiveServiceFeeRate(
  supabase: SupabaseClient<Database>,
  currency?: string | null,
  countryCode?: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc("get_active_platform_fee_rate", {
    p_currency: currency ?? undefined,
    p_country_code: countryCode ?? undefined,
  });

  if (error || data == null) {
    if (error) {
      logger.error(`Failed reading platform fee rate: ${error.message}`);
    }
    return DEFAULT_SERVICE_FEE_RATE;
  }

  const rate = Number(data);
  return Number.isFinite(rate) && rate >= 0 && rate < 1
    ? rate
    : DEFAULT_SERVICE_FEE_RATE;
}
