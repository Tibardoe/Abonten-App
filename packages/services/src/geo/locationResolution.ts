// Where a point on the map IS, for the platform's purposes: which country
// (and therefore which market, currency and payment provider) and which
// IANA time zone. Resolved on the SERVER whenever an event or place is
// saved, from its coordinates, so a client can never place a London venue
// in Ghana to pick a cheaper fee or another provider.
//
//   * Time zone: @photostructure/tz-lookup — an offline polygon lookup that
//     is exact for populated places (the borders it blurs are in oceans and
//     deserts). No network call, no key, sub-millisecond.
//   * Country: Google reverse geocoding (result_type=country), cached per
//     ~1 km cell for the life of the process. If Google is unreachable the
//     country is inferred from the zone's market when only one market uses
//     that zone, else from the nearest market region within 300 km, else the
//     save is refused with a clear message rather than guessed.
//
// A country without a market is not a place Abonten can list yet: the
// resolver says so and the create/update cores refuse. That is the product
// rule ("Abonten isn't available in France yet"), not a limitation.

import { distanceMetres } from "@abonten/core/fieldOps/territory";
import { findCountry } from "@abonten/core/geo/countries";
import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import type { MarketConfig } from "@abonten/core/market/types";
import { isMarketTransacting } from "@abonten/core/market/types";
import { isValidTimeZone } from "@abonten/core/time/timeZone";
import tzlookup from "@photostructure/tz-lookup";
import { listMarkets } from "../markets/marketConfig";

export type ResolvedLocation = {
  countryCode: string;
  timeZone: string;
  /** The market the point belongs to, when Abonten has one for that country. */
  market: MarketConfig | null;
  /** How the country was found. */
  source: "geocoder" | "zone" | "region" | "hint";
};

export type LocationResolutionResult =
  | { ok: true; location: ResolvedLocation }
  | {
      ok: false;
      reason: "unknown_country" | "no_market" | "market_closed";
      message: string;
    };

const countryCache = new Map<string, string | null>();
const COUNTRY_CACHE_MAX = 5000;

function cellKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/** The IANA zone at a point; "UTC" only for coordinates outside any zone. */
export function timeZoneAt(lat: number, lng: number): string {
  try {
    const zone = tzlookup(lat, lng);
    return isValidTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

async function countryFromGoogle(
  lat: number,
  lng: number,
): Promise<string | null> {
  const key =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const cache = cellKey(lat, lng);
  if (countryCache.has(cache)) return countryCache.get(cache) ?? null;
  try {
    const res = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=country&key=${key}`,
      { timeoutMs: HTTP_TIMEOUTS.googleGeocode },
    );
    const json = (await res.json()) as {
      status?: string;
      results?: {
        address_components?: { short_name: string; types: string[] }[];
      }[];
    };
    let code: string | null = null;
    if (json.status === "OK") {
      for (const r of json.results ?? []) {
        const c = r.address_components?.find((x) =>
          x.types.includes("country"),
        );
        if (c && /^[A-Z]{2}$/i.test(c.short_name)) {
          code = c.short_name.toUpperCase();
          break;
        }
      }
    } else if (json.status !== "ZERO_RESULTS") {
      logger.warn(
        `locationResolution: reverse geocode returned ${json.status}`,
      );
      return null;
    }
    if (countryCache.size >= COUNTRY_CACHE_MAX) countryCache.clear();
    countryCache.set(cache, code);
    return code;
  } catch (error) {
    logger.warn(
      `locationResolution: reverse geocode failed (${error instanceof Error ? error.message : String(error)})`,
    );
    return null;
  }
}

/**
 * Resolves the country and time zone of a point. `countryHint` is what the
 * client's geocoder said (a structured address's country); it is used only
 * when the server cannot reach its own geocoder AND the hint is consistent
 * with the zone (a hint of "GB" with an Accra zone is ignored).
 */
export async function resolveLocation(input: {
  lat: number;
  lng: number;
  countryHint?: string | null;
}): Promise<ResolvedLocation> {
  const timeZone = timeZoneAt(input.lat, input.lng);
  const markets = await listMarkets();

  let countryCode = await countryFromGoogle(input.lat, input.lng);
  let source: ResolvedLocation["source"] = "geocoder";

  if (!countryCode) {
    // Which markets use this zone? One answer means the zone decides.
    const byZone = markets.filter((m) => m.defaultTimeZone === timeZone);
    const hint = input.countryHint?.toUpperCase() ?? null;
    if (
      hint &&
      findCountry(hint) &&
      (byZone.length === 0 || byZone.some((m) => m.countryCode === hint))
    ) {
      countryCode = hint;
      source = "hint";
    } else if (byZone.length === 1) {
      countryCode = byZone[0].countryCode;
      source = "zone";
    } else {
      // Nearest region of any market within 300 km.
      let best: { code: string; d: number } | null = null;
      for (const m of markets) {
        for (const r of m.regions) {
          const d = distanceMetres(
            { lat: input.lat, lng: input.lng },
            { lat: r.lat, lng: r.lng },
          );
          if (d <= 300_000 && (!best || d < best.d))
            best = { code: m.countryCode, d };
        }
      }
      if (best) {
        countryCode = best.code;
        source = "region";
      }
    }
  }

  if (!countryCode) {
    return { countryCode: "", timeZone, market: null, source };
  }
  return {
    countryCode,
    timeZone,
    market: markets.find((m) => m.countryCode === countryCode) ?? null,
    source,
  };
}

/**
 * For creating or moving a listing: the point must be in a country Abonten
 * has a LIVE market for. Returns the resolved location or a message the
 * organizer can act on.
 */
export async function resolveListingLocation(input: {
  lat: number;
  lng: number;
  countryHint?: string | null;
}): Promise<LocationResolutionResult> {
  const location = await resolveLocation(input);
  if (!location.countryCode) {
    return {
      ok: false,
      reason: "unknown_country",
      message:
        "We couldn't tell which country this location is in. Try a more specific address.",
    };
  }
  if (!location.market) {
    const name =
      findCountry(location.countryCode)?.name ?? location.countryCode;
    return {
      ok: false,
      reason: "no_market",
      message: `Abonten isn't available in ${name} yet.`,
    };
  }
  // New listings need a market that is taking business: not paused, and
  // not in maintenance (browsable, but nothing new is sold or listed).
  if (!isMarketTransacting(location.market.status)) {
    return {
      ok: false,
      reason: "market_closed",
      message: `Abonten isn't taking new listings in ${location.market.name} right now.`,
    };
  }
  return { ok: true, location };
}
