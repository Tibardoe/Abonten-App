// How much is listed in each launched city: upcoming published events plus
// published places inside its radius (SQL market_region_activity, the same
// counts Admin shows under each city). Explore's "most active" browse
// fallback ranks cities by it.
//
// Kept apart from the market configuration on purpose: payments and
// listings read that configuration, and a slow or failing count must never
// take them down. Loaded at most every five minutes per process; on a
// failure the last answer is served, or none — "most active" then falls
// back to the nearest city.

import { logger } from "@abonten/core/logger";
import type { CityActivity } from "@abonten/core/market/coverage";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

const TTL_MS = 5 * 60_000;

let cache: { at: number; byRegion: Map<string, CityActivity> } | null = null;
let inflight: Promise<Map<string, CityActivity>> | null = null;

async function load(): Promise<Map<string, CityActivity>> {
  const { data, error } = await getSupabaseServiceClient().rpc(
    "market_region_activity",
    {},
  );
  if (error) throw new Error(error.message);
  const byRegion = new Map<string, CityActivity>();
  for (const row of data ?? []) {
    byRegion.set(row.region_id, {
      upcomingEvents: Number(row.upcoming_events),
      places: Number(row.places),
    });
  }
  return byRegion;
}

/** Activity per launched city of a live market, keyed by region id. */
export async function getRegionActivity(): Promise<Map<string, CityActivity>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.byRegion;
  if (!inflight) {
    inflight = load()
      .then((byRegion) => {
        cache = { at: Date.now(), byRegion };
        return byRegion;
      })
      .catch((error) => {
        logger.warn(
          `regionActivity: load failed (${error instanceof Error ? error.message : String(error)})`,
        );
        return cache?.byRegion ?? new Map<string, CityActivity>();
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drops the cache (tests, and after Admin changes a city). */
export function invalidateRegionActivity(): void {
  cache = null;
}
