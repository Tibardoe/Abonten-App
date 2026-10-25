import { logger } from "@abonten/core/logger";
import { containingRegion } from "@abonten/core/market/coverage";
import type { MarketConfig } from "@abonten/core/market/types";
import { listOpenMarkets } from "@abonten/services/markets/marketConfig";
import { getRegionActivity } from "@abonten/services/markets/regionActivity";

// What the website offers search engines, beyond what robots.txt keeps out:
// which accounts' listings are left out, and which city pages are real
// pages rather than any text typed after /explore/.

/**
 * Accounts whose listings and profile stay out of search engines. The App
 * Review demo account ("Abonten Events") organizes sample events that are
 * not real (each description says so); a search engine would list them as
 * real events in Accra and Cape Coast. Remove the id when the samples are
 * deleted before launch (docs/finance/paystack-live-cutover.md 1.3).
 */
const NOT_INDEXED_ACCOUNTS: ReadonlySet<string> = new Set([
  "22d25b53-4c08-4070-9097-1fac287351c8",
]);

export function isIndexedAccount(userId: string | null | undefined): boolean {
  return !userId || !NOT_INDEXED_ACCOUNTS.has(userId);
}

export type CityRef = {
  slug: string;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
};

export type IndexedCity = CityRef & {
  /**
   * Something is listed in it (an upcoming event or a place). A city page
   * with nothing to show is a "soft 404" to Google, which refuses to index
   * it (Search Console, 2026-10-25), so it says noindex until it has.
   * True when the count could not be read.
   */
  hasListings: boolean;
};

async function liveMarkets(): Promise<MarketConfig[]> {
  try {
    return (await listOpenMarkets()).filter((m) => m.status === "live");
  } catch (error) {
    // No market configuration (a build without the service key, a database
    // that is down): the pages render without the city facts.
    logger.warn("searchIndexing: market configuration unavailable", error);
    return [];
  }
}

/**
 * The cities of live markets that Abonten has launched in, in each
 * market's order: the Explore pages search engines are told about.
 */
export async function indexedCities(): Promise<IndexedCity[]> {
  const [markets, activity] = await Promise.all([
    liveMarkets(),
    getRegionActivity(),
  ]);
  return markets.flatMap((market) =>
    market.regions
      .filter(
        (r) =>
          r.kind === "city" &&
          r.status === "active" &&
          r.launchStatus === "launched",
      )
      .map((r) => {
        const counts = activity.get(r.id);
        return {
          slug: r.slug,
          name: r.name,
          countryCode: market.countryCode,
          lat: r.lat,
          lng: r.lng,
          hasListings: counts
            ? counts.upcomingEvents + counts.places > 0
            : true,
        };
      }),
  );
}

/** The launched city a /explore/<slug> address names, if it names one. */
export async function indexedCityForSlug(
  slug: string,
): Promise<IndexedCity | null> {
  const wanted = slug.toLowerCase();
  return (await indexedCities()).find((c) => c.slug === wanted) ?? null;
}

/**
 * The listed city of a live market a point is in, for a listing's address.
 * `launched` says whether its Explore page is one search engines are shown.
 */
export async function cityAt(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<(CityRef & { launched: boolean }) | null> {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const markets = await liveMarkets();
  const found = containingRegion(markets, { lat, lng });
  if (!found) return null;
  return {
    slug: found.region.slug,
    name: found.region.name,
    countryCode: found.countryCode,
    lat: found.region.lat,
    lng: found.region.lng,
    launched: found.region.launchStatus !== "coming_soon",
  };
}
