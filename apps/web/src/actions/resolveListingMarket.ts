"use server";

import {
  type ListingMarketResult,
  getListingMarketCore,
} from "@abonten/services/markets/marketContextCore";

/**
 * The market a venue point belongs to, for the event and place forms: the
 * currency prices are entered in and the zone times are read in. The save
 * path resolves the same way server-side, so what the form shows is what
 * will be stored. Safe to call unauthenticated (no personal data).
 */
export default async function resolveListingMarket(input: {
  lat: number;
  lng: number;
  countryHint?: string | null;
}): Promise<ListingMarketResult> {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { ok: false, message: "Choose a location first." };
  }
  return getListingMarketCore(input);
}
