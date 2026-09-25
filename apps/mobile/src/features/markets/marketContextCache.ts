import { queryClient } from "@/lib/queryClient";
import type { MarketContextResult } from "@abonten/types/marketType";

// The query key of the market context, and a synchronous read of the last
// answer in the cache (restored from disk on a cold start). Kept apart from
// MarketProvider so the location provider can read it without an import
// cycle (MarketProvider depends on the browsing area).

export const MARKET_CONTEXT_KEY = ["mobile", "markets", "context"] as const;

/** The default (or last browsed) market's centre and first city, if known. */
export function cachedMarketCentre(): {
  lat: number;
  lng: number;
  label: string;
} | null {
  const entries = queryClient.getQueriesData<MarketContextResult>({
    queryKey: MARKET_CONTEXT_KEY,
  });
  for (const [, data] of entries) {
    if (!data) continue;
    const market = data.markets.find(
      (m) => m.countryCode === data.context.marketCountry,
    );
    if (!market) continue;
    const city = market.regions.find((r) => r.status === "active");
    if (city) return { lat: city.lat, lng: city.lng, label: city.name };
    if (market.centre) return { ...market.centre, label: market.name };
  }
  return null;
}
