// A person's own locale preferences: home market, the currency they want
// price estimates in, and the distance unit. Home market is server-owned
// (the user_info_protect_columns trigger refuses client writes since migration
// 20260924100500): it must be an open market, and it decides which market's
// rules apply where no listing decides (credit currency at account opening,
// wallet rails). The other two only change what a screen shows.

import { logger } from "@abonten/core/logger";
import { isMarketOpen } from "@abonten/core/market/types";
import { isKnownCurrency } from "@abonten/core/money/currencies";
import { phoneCountry } from "@abonten/core/phone/phone";
import type {
  LocalePreferences,
  LocalePreferencesPatch,
} from "@abonten/types/marketType";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { getMarket, listMarkets, marketForPhone } from "./marketConfig";

export type { LocalePreferences };

type Envelope<T> = { status: number; message?: string; data?: T };

export async function getLocalePreferencesCore(
  userId: string,
): Promise<Envelope<LocalePreferences>> {
  if (!userId) return { status: 401, message: "User not logged in" };
  const { data, error } = await getSupabaseServiceClient()
    .from("user_info")
    .select("country_code, display_currency, distance_unit, locale")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`getLocalePreferencesCore(${userId}): ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  return {
    status: 200,
    data: {
      countryCode: data?.country_code ?? null,
      displayCurrency: data?.display_currency ?? null,
      distanceUnit:
        data?.distance_unit === "km" || data?.distance_unit === "mi"
          ? data.distance_unit
          : null,
      locale: data?.locale ?? null,
    },
  };
}

export async function updateLocalePreferencesCore(
  userId: string,
  patch: LocalePreferencesPatch,
): Promise<Envelope<LocalePreferences>> {
  if (!userId) return { status: 401, message: "User not logged in" };

  const update: {
    country_code?: string;
    display_currency?: string | null;
    distance_unit?: string | null;
    locale?: string | null;
  } = {};

  if (patch.countryCode !== undefined) {
    const code = patch.countryCode?.trim().toUpperCase() ?? null;
    if (!code) {
      return { status: 400, message: "Choose your country." };
    }
    const market = await getMarket(code);
    if (!market || !isMarketOpen(market.status)) {
      return {
        status: 400,
        message: "Abonten isn't available in that country yet.",
      };
    }
    update.country_code = code;
  }

  if (patch.displayCurrency !== undefined) {
    const code = patch.displayCurrency?.trim().toUpperCase() || null;
    if (code && !isKnownCurrency(code)) {
      return { status: 400, message: "Choose a currency from the list." };
    }
    update.display_currency = code;
  }

  if (patch.distanceUnit !== undefined) {
    const unit = patch.distanceUnit;
    if (unit !== null && unit !== "km" && unit !== "mi") {
      return { status: 400, message: "Choose kilometres or miles." };
    }
    update.distance_unit = unit;
  }

  if (patch.locale !== undefined) {
    const locale = patch.locale?.trim() || null;
    if (locale && !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) {
      return { status: 400, message: "That language code isn't valid." };
    }
    update.locale = locale;
  }

  if (Object.keys(update).length > 0) {
    const { error } = await getSupabaseServiceClient()
      .from("user_info")
      .update(update)
      .eq("id", userId);
    if (error) {
      logger.error(`updateLocalePreferencesCore(${userId}): ${error.message}`);
      return { status: 500, message: "Couldn't save your preferences." };
    }
  }
  return getLocalePreferencesCore(userId);
}

/**
 * Sets a new account's home market from its verified phone number, when
 * the number's country is an open market and none is set yet. Never
 * overwrites a choice and never fails the sign-in that calls it.
 */
export async function adoptHomeCountryFromPhone(
  userId: string,
  phoneE164: string,
): Promise<void> {
  try {
    const { market } = await marketForPhone(phoneE164);
    if (!market || !isMarketOpen(market.status)) return;
    const country = market.countryCode;
    const { error } = await getSupabaseServiceClient()
      .from("user_info")
      .update({ country_code: country })
      .eq("id", userId)
      .is("country_code", null);
    if (error)
      logger.warn(`adoptHomeCountryFromPhone(${userId}): ${error.message}`);
  } catch (error) {
    logger.warn(
      `adoptHomeCountryFromPhone(${userId}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
