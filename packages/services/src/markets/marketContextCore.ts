// What a client needs to feel local, in one call: the open markets (public
// subset), the resolved locale context for this viewer, the display-rate
// table for estimates, and the feature flags that apply. Served by the
// mobile route /api/mobile/markets/context and the web layout.

import { evaluateFlags } from "@abonten/core/flags/evaluateFlag";
import type { FlagPlatform } from "@abonten/core/flags/evaluateFlag";
import { logger } from "@abonten/core/logger";
import {
  type LocaleContext,
  type LocaleContextInput,
  resolveLocaleContext,
} from "@abonten/core/market/context";
import type { PublicMarket } from "@abonten/core/market/types";
import type { RateTable } from "@abonten/core/money/conversion";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listFeatureFlags } from "../flags/featureFlagCore";
import { getDisplayRateTable } from "../fx/exchangeRateCore";
import { resolveLocation } from "../geo/locationResolution";
import { getDefaultMarket, listPublicMarkets } from "./marketConfig";

export type MarketContextResult = {
  markets: PublicMarket[];
  context: LocaleContext;
  rates: RateTable | null;
  flags: Record<string, boolean>;
};

export async function getMarketContextCore(input: {
  supabase?: SupabaseClient<Database> | null;
  userId?: string | null;
  browsingCountry?: string | null;
  /** The browsing area's centre; its country is looked up when no code is given. */
  browsingPoint?: { lat: number; lng: number } | null;
  requestCountry?: string | null;
  viewerTimeZone?: string | null;
  viewerLocale?: string | null;
  platform: FlagPlatform;
  appVersion?: string | null;
  installId?: string | null;
  cohorts?: string[];
}): Promise<MarketContextResult> {
  const [markets, defaultMarket] = await Promise.all([
    listPublicMarkets(),
    getDefaultMarket(),
  ]);

  let preferences: LocaleContextInput["preferences"] = null;
  if (input.supabase && input.userId) {
    const { data, error } = await input.supabase
      .from("user_info")
      .select("country_code, display_currency, locale, distance_unit")
      .eq("id", input.userId)
      .maybeSingle();
    if (error) {
      logger.warn(`marketContext: preference read failed (${error.message})`);
    } else if (data) {
      preferences = {
        countryCode: data.country_code,
        displayCurrency: data.display_currency,
        locale: data.locale,
        distanceUnit: (data.distance_unit as "km" | "mi" | null) ?? null,
      };
    }
  }

  let browsingCountry = input.browsingCountry ?? null;
  if (!browsingCountry && input.browsingPoint) {
    try {
      browsingCountry = (await resolveLocation(input.browsingPoint))
        .countryCode;
    } catch (error) {
      logger.warn(
        `marketContext: browsing point lookup failed (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  const context = resolveLocaleContext({
    markets,
    defaultMarketCountry: defaultMarket.countryCode,
    preferences,
    browsingCountry,
    requestCountry: input.requestCountry,
    viewerTimeZone: input.viewerTimeZone,
    viewerLocale: input.viewerLocale,
  });

  const [rates, flagRows] = await Promise.all([
    getDisplayRateTable(),
    listFeatureFlags(),
  ]);
  const flags = evaluateFlags(flagRows, {
    countryCode: context.marketCountry,
    platform: input.platform,
    cohorts: input.cohorts ?? [],
    subjectId: input.userId ?? input.installId ?? null,
    appVersion: input.appVersion ?? null,
  });

  return { markets, context, rates, flags };
}

export type ListingMarketResult =
  | {
      ok: true;
      countryCode: string;
      countryName: string;
      currency: string;
      timeZone: string;
      marketStatus: string;
    }
  | { ok: false; message: string };

/**
 * The market a venue point belongs to, for the create/edit forms: which
 * currency the prices are in and which zone the times are read in. The
 * same resolver the save path uses, so the preview and the result agree.
 */
export async function getListingMarketCore(input: {
  lat: number;
  lng: number;
  countryHint?: string | null;
}): Promise<ListingMarketResult> {
  const location = await resolveLocation(input);
  if (!location.countryCode) {
    return {
      ok: false,
      message: "We couldn't tell which country this location is in.",
    };
  }
  if (!location.market) {
    return {
      ok: false,
      message: "Abonten isn't available in this country yet.",
    };
  }
  return {
    ok: true,
    countryCode: location.countryCode,
    countryName: location.market.name,
    currency: location.market.defaultCurrency,
    timeZone: location.timeZone,
    marketStatus: location.market.status,
  };
}
