// Coordinates for a place name typed into a public URL (/explore/<name>,
// /events/location/<name>). Those pages are open to signed-out visitors, so
// every name that reaches Google is a billed call anyone can trigger with a
// made-up slug. In order:
//   1. a market city or region ("accra", "cape-coast") — no call at all;
//   2. geocode_cache — every answer Google gave, found or not, for 30 days;
//   3. Google, only within a per-address and a global hourly budget.
// Out of budget (or Google down), the answer is "no coordinates", which the
// pages already show as an unresolved location rather than an error.

import { logger } from "@abonten/core/logger";
import { listOpenMarkets } from "../markets/marketConfig";
import { checkRateLimit } from "../security/rateLimit";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export type PlaceNameGeocode = {
  lat: number | null;
  lng: number | null;
  error?: string;
};

/** The answer Google gave: a point, "no such place", or no answer at all. */
export type GeocodeLookup = (
  query: string,
) => Promise<{ lat: number; lng: number } | "not_found" | "unavailable">;

const MAX_QUERY_LENGTH = 120;
const CACHE_DAYS = 30;
export const GEOCODE_PER_ADDRESS_LIMIT = 20;
export const GEOCODE_PER_ADDRESS_WINDOW_SECONDS = 600;
export const GEOCODE_GLOBAL_PER_HOUR = 300;

function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * The cache key and the text sent to Google: a URL slug or a typed name,
 * folded to lower case without accents, separators as spaces. Null when
 * nothing usable is left or it is too long to be a place name.
 */
export function normalizePlaceQuery(raw: string): string | null {
  let text = raw;
  try {
    text = decodeURIComponent(raw);
  } catch {
    // Not URI-encoded; use as given.
  }
  const key = fold(text)
    .replace(/[-_+]+/g, " ")
    .replace(/[^\p{L}\p{N} ,.']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!key || key.length > MAX_QUERY_LENGTH) return null;
  return key;
}

export async function geocodePlaceName(input: {
  query: string;
  ipAddress: string | null;
  lookup: GeocodeLookup;
}): Promise<PlaceNameGeocode> {
  const key = normalizePlaceQuery(input.query);
  if (!key) return { lat: null, lng: null, error: "No address" };

  // 1. A market city or region.
  try {
    for (const market of await listOpenMarkets()) {
      for (const region of market.regions) {
        if (region.status !== "active") continue;
        if (
          key === region.slug.replace(/-/g, " ") ||
          key === fold(region.name)
        ) {
          return { lat: region.lat, lng: region.lng };
        }
      }
    }
  } catch (error) {
    logger.warn("geocodePlaceName: market regions unavailable", error);
  }

  // 2. The cache.
  const service = getSupabaseServiceClient();
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString();
  const { data: cached } = await service
    .from("geocode_cache")
    .select("lat, lng, found")
    .eq("query_key", key)
    .gte("created_at", since)
    .maybeSingle();
  if (cached) {
    return cached.found && cached.lat !== null && cached.lng !== null
      ? { lat: cached.lat, lng: cached.lng }
      : { lat: null, lng: null, error: "Location not found" };
  }

  // 3. Google, within budget.
  if (
    input.ipAddress &&
    !(await checkRateLimit(
      `geocode-page:${input.ipAddress}`,
      GEOCODE_PER_ADDRESS_LIMIT,
      GEOCODE_PER_ADDRESS_WINDOW_SECONDS,
    ))
  ) {
    return { lat: null, lng: null, error: "Location lookup unavailable" };
  }
  if (
    !(await checkRateLimit(
      "geocode-page:global",
      GEOCODE_GLOBAL_PER_HOUR,
      3600,
    ))
  ) {
    logger.warn("geocodePlaceName: global hourly budget spent", {
      security: { event: "geocode_budget_spent" },
    });
    return { lat: null, lng: null, error: "Location lookup unavailable" };
  }

  const answer = await input.lookup(key);
  if (answer === "unavailable") {
    return { lat: null, lng: null, error: "Location lookup unavailable" };
  }
  const found = answer !== "not_found";
  const { error } = await service.from("geocode_cache").upsert(
    {
      query_key: key,
      found,
      lat: found ? answer.lat : null,
      lng: found ? answer.lng : null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "query_key" },
  );
  if (error)
    logger.warn(`geocodePlaceName: cache write failed: ${error.message}`);
  return found
    ? { lat: answer.lat, lng: answer.lng }
    : { lat: null, lng: null, error: "Location not found" };
}
