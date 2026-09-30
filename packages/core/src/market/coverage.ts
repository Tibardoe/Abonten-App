// Is Abonten open where the person is looking? Inside a live market, supply
// arrives city by city: a city (market_region) is `launched` or
// `coming_soon`, and the market's `coverageMode` says what a point outside
// every listed city is — open (`everywhere`, the default) or not launched
// yet (`launched_areas`).
//
// "Not launched" never blocks anything. Search, shared links, tickets and
// creating listings keep working; the answer only changes what Explore says
// ("Abonten isn't in Kumasi yet"), which city it offers instead (the
// nearest launched one) and whether it offers the waiting list. The server
// recomputes it before recording anyone on the list.
//
// Framework-free and structural, so the web server, the app (from the
// persisted market context) and the services all apply the same rule.

import { distanceMetres } from "../fieldOps/territory";

export type LatLng = { lat: number; lng: number };

export type LaunchStatus = "launched" | "coming_soon";
export type CoverageMode = "everywhere" | "launched_areas";

/** The parts of a market region the rule reads. */
export type CoverageRegion = {
  id: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
  status: "active" | "inactive";
  /** Absent in answers from before 2026-09-30: launched. */
  launchStatus?: LaunchStatus;
};

/** The parts of a market the rule reads. */
export type CoverageMarket = {
  countryCode: string;
  /** Absent in answers from before 2026-09-30: everywhere. */
  coverageMode?: CoverageMode;
  regions: CoverageRegion[];
};

export type NearestLaunched = {
  region: CoverageRegion;
  countryCode: string;
  distanceKm: number;
};

export type AreaCoverage =
  | {
      kind: "open";
      /** The listed city the point is in, if any. */
      region: CoverageRegion | null;
    }
  | {
      kind: "not_launched";
      /** The coming-soon city the point is in; null outside every city. */
      region: CoverageRegion | null;
      /** The country the answer was made for (the region's, or the market's). */
      countryCode: string | null;
      /** The closest launched city, to browse instead. */
      nearest: NearestLaunched | null;
    };

export function regionLaunchStatus(region: CoverageRegion): LaunchStatus {
  return region.launchStatus === "coming_soon" ? "coming_soon" : "launched";
}

function isActive(region: CoverageRegion): boolean {
  return region.status === "active";
}

/** True when the point is within the region's radius. */
export function isInsideRegion(point: LatLng, region: CoverageRegion): boolean {
  return distanceMetres(point, region) <= region.radiusKm * 1000;
}

/**
 * The listed city a point is in: of the active cities whose radius covers
 * it, the one whose centre is closest. Null outside every city.
 */
export function containingRegion(
  markets: readonly CoverageMarket[],
  point: LatLng,
): { region: CoverageRegion; countryCode: string } | null {
  let best: {
    region: CoverageRegion;
    countryCode: string;
    d: number;
  } | null = null;
  for (const m of markets) {
    for (const r of m.regions) {
      if (!isActive(r)) continue;
      const d = distanceMetres(point, r);
      if (d > r.radiusKm * 1000) continue;
      if (!best || d < best.d)
        best = { region: r, countryCode: m.countryCode, d };
    }
  }
  return best ? { region: best.region, countryCode: best.countryCode } : null;
}

/** The closest active, launched city to a point, in any of the markets. */
export function nearestLaunchedRegion(
  markets: readonly CoverageMarket[],
  point: LatLng,
  excludeRegionId?: string | null,
): NearestLaunched | null {
  let best: NearestLaunched | null = null;
  for (const m of markets) {
    for (const r of m.regions) {
      if (!isActive(r) || regionLaunchStatus(r) !== "launched") continue;
      if (excludeRegionId && r.id === excludeRegionId) continue;
      const km = distanceMetres(point, r) / 1000;
      if (!best || km < best.distanceKm)
        best = { region: r, countryCode: m.countryCode, distanceKm: km };
    }
  }
  return best;
}

/**
 * Whether Abonten is open at `point`.
 *
 *   1. Inside a listed city: that city's launch status decides.
 *   2. Outside every city: the market's coverage mode decides. The market is
 *      `marketCountry` — the one the rest of the app already resolved for
 *      this area (browsing country, then preference, request, default).
 *
 * `markets` are the open markets (their inactive cities are ignored).
 */
export function areaCoverage(input: {
  markets: readonly CoverageMarket[];
  marketCountry: string | null | undefined;
  point: LatLng;
}): AreaCoverage {
  const { markets, point } = input;
  const inside = containingRegion(markets, point);
  if (inside) {
    if (regionLaunchStatus(inside.region) === "launched")
      return { kind: "open", region: inside.region };
    return {
      kind: "not_launched",
      region: inside.region,
      countryCode: inside.countryCode,
      nearest: nearestLaunchedRegion(markets, point, inside.region.id),
    };
  }
  const code = input.marketCountry?.toUpperCase() ?? null;
  const market = code ? markets.find((m) => m.countryCode === code) : null;
  if (!market || market.coverageMode !== "launched_areas")
    return { kind: "open", region: null };
  return {
    kind: "not_launched",
    region: null,
    countryCode: market.countryCode,
    nearest: nearestLaunchedRegion(markets, point),
  };
}

/** Two decimals of a degree: about a kilometre, never a precise position. */
export function coarsePoint(point: LatLng): LatLng {
  return {
    lat: Math.round(point.lat * 100) / 100,
    lng: Math.round(point.lng * 100) / 100,
  };
}

/**
 * The key of a waiting-list row: one per person per area. A listed city is
 * one area however far across it the person asks from; outside every city
 * it is the ~1 km cell.
 */
export function waitlistAreaKey(
  region: Pick<CoverageRegion, "id"> | null,
  point: LatLng,
): string {
  if (region) return `region:${region.id}`;
  const c = coarsePoint(point);
  return `point:${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
}

/**
 * How near a waiting-list row outside every city must be to count as "this
 * area" when asking whether someone is already waiting here, or when they
 * leave the list. A town, not a street: moving across it keeps the answer.
 */
export const WAITLIST_SAME_AREA_KM = 10;

/** Whole kilometres for "Accra · 250 km away"; "under 1 km" never shown. */
export function roundedDistanceKm(km: number): number {
  if (km < 10) return Math.max(1, Math.round(km));
  if (km < 100) return Math.round(km / 5) * 5;
  return Math.round(km / 10) * 10;
}
