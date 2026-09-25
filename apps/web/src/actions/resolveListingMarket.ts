"use server";

import { createClient } from "@/config/supabase/server";
import {
  LISTING_MARKET_LOOKUPS_PER_MINUTE,
  type ListingMarketResult,
  getListingMarketCore,
} from "@abonten/services/markets/marketContextCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";

/**
 * The market a venue point belongs to, for the event and place forms: the
 * currency prices are entered in and the zone times are read in. The save
 * path resolves the same way server-side, so what the form shows is what
 * will be stored. Signed-in and rate limited: a new point can cost a billed
 * Google reverse-geocode call (the forms that use it are signed-in only).
 */
export default async function resolveListingMarket(input: {
  lat: number;
  lng: number;
  countryHint?: string | null;
}): Promise<ListingMarketResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Sign in to continue." };

  const allowed = await checkRateLimit(
    `listing-market:${user.id}`,
    LISTING_MARKET_LOOKUPS_PER_MINUTE,
    60,
  );
  if (!allowed) {
    return {
      ok: false,
      message: "Too many location checks. Please wait a moment.",
    };
  }
  return getListingMarketCore(input);
}
