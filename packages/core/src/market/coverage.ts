// Is Abonten open where the person is looking? Inside a live market, supply
// arrives city by city: a city (market_region) is `launched` or
// `coming_soon`, and the market's `coverageMode` says what a point outside
// every listed city is — open (`everywhere`, the default) or not launched
// yet (`launched_areas`).
//
// "Not launched" never blocks anything. Search, shared links, tickets and
// creating listings keep working; the answer only changes what Explore says
// ("Abonten isn't in Kumasi yet"), which launched cities it offers to browse
// instead (`browseSuggestions`, per the market's browse fallback) and
// whether it offers the waiting list. The server recomputes it before
// recording anyone on the list.
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
  /** Admin ordering; breaks distance ties. */
  position?: number;
  /** Listings inside the radius, for "most active"; absent when unknown. */
  activity?: CityActivity | null;
};

/** The parts of a market the rule reads. */
export type CoverageMarket = {
  countryCode: string;
  /** Only a live market's cities are ever suggested; absent = live. */
  status?: string;
  /** Absent in answers from before 2026-09-30: everywhere. */
  coverageMode?: CoverageMode;
  /** Absent in answers cached before the setting existed: the default. */
  browseFallback?: Partial<BrowseFallback> | null;
  regions: CoverageRegion[];
};

/**
 * How a city's activity is measured for "most active": upcoming published
 * events plus published places inside its radius (market_region_activity,
 * the same counts Admin shows under each city).
 */
export type CityActivity = { upcomingEvents: number; places: number };

/**
 * How Explore picks launched cities to offer someone in an area Abonten
 * hasn't launched in (market.browse_fallback):
 *
 *   choose       up to `limit` launched cities, nearest first; the person
 *                picks (the default)
 *   nearest      the nearest launched city
 *   most_active  the launched city with the most upcoming events + places;
 *                a tie goes to the nearer city, and when none has any
 *                listings the nearest is offered
 *   fixed        the city staff chose (`regionId`); the nearest while that
 *                city is not an active, launched city of the market
 */
export type BrowseStrategy = "choose" | "nearest" | "most_active" | "fixed";

export const BROWSE_STRATEGIES: readonly BrowseStrategy[] = [
  "choose",
  "nearest",
  "most_active",
  "fixed",
];

export type BrowseFallback = {
  strategy: BrowseStrategy;
  regionId: string | null;
  limit: number;
};

export const BROWSE_LIMIT_MIN = 2;
export const BROWSE_LIMIT_MAX = 5;

export const DEFAULT_BROWSE_FALLBACK: BrowseFallback = {
  strategy: "choose",
  regionId: null,
  limit: 3,
};

/** A launched city offered to browse, and how far it is. */
export type BrowseCity = {
  region: CoverageRegion;
  countryCode: string;
  distanceKm: number;
};

/**
 * What to offer. `reason` says why a single city is recommended (shown next
 * to it, so it reads as a suggestion, not "your" city); null for a list, or
 * when the only launched city is simply the only one. `cities` is empty
 * when no launched city exists anywhere.
 */
export type BrowseSuggestions = {
  /** The strategy that produced `cities`, after any fallback. */
  strategy: BrowseStrategy;
  reason: "nearest" | "most_active" | "recommended" | null;
  cities: BrowseCity[];
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
      /** Launched cities to browse instead, per the market's fallback. */
      browse: BrowseSuggestions;
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

/** A market's browse fallback, with anything unknown or out of range reset. */
export function normalizeBrowseFallback(
  raw: Partial<BrowseFallback> | null | undefined,
): BrowseFallback {
  const strategy = BROWSE_STRATEGIES.includes(raw?.strategy as BrowseStrategy)
    ? (raw?.strategy as BrowseStrategy)
    : DEFAULT_BROWSE_FALLBACK.strategy;
  const limit =
    typeof raw?.limit === "number" && Number.isInteger(raw.limit)
      ? Math.min(BROWSE_LIMIT_MAX, Math.max(BROWSE_LIMIT_MIN, raw.limit))
      : DEFAULT_BROWSE_FALLBACK.limit;
  const regionId =
    typeof raw?.regionId === "string" && raw.regionId ? raw.regionId : null;
  return { strategy, regionId, limit };
}

function byDistance(a: BrowseCity, b: BrowseCity): number {
  return (
    a.distanceKm - b.distanceKm ||
    (a.region.position ?? 100) - (b.region.position ?? 100) ||
    a.region.name.localeCompare(b.region.name)
  );
}

/**
 * The cities of one market that may be offered: active, launched, in a live
 * market, not the city the person is in. Two rows with the same name (a
 * duplicated configuration) are offered once, the nearer one.
 */
function candidateCities(
  market: CoverageMarket,
  point: LatLng,
  excludeRegionId: string | null,
): BrowseCity[] {
  if (market.status !== undefined && market.status !== "live") return [];
  const byName = new Map<string, BrowseCity>();
  for (const r of market.regions) {
    if (!isActive(r) || regionLaunchStatus(r) !== "launched") continue;
    if (excludeRegionId && r.id === excludeRegionId) continue;
    const city: BrowseCity = {
      region: r,
      countryCode: market.countryCode,
      distanceKm: distanceMetres(point, r) / 1000,
    };
    const key = r.name.trim().toLocaleLowerCase();
    const seen = byName.get(key);
    if (!seen || city.distanceKm < seen.distanceKm) byName.set(key, city);
  }
  return [...byName.values()].sort(byDistance);
}

function listings(city: BrowseCity): number {
  const a = city.region.activity;
  return a ? a.upcomingEvents + a.places : 0;
}

/**
 * Launched cities to offer someone at `point` in `countryCode`, per that
 * market's browse fallback. Cities come from the same country; when it has
 * no launched city, the single nearest launched city of any live market is
 * offered (as "nearest"), and when there is none anywhere, nothing.
 */
export function browseSuggestions(input: {
  markets: readonly CoverageMarket[];
  point: LatLng;
  countryCode: string | null | undefined;
  excludeRegionId?: string | null;
}): BrowseSuggestions {
  const { markets, point } = input;
  const exclude = input.excludeRegionId ?? null;
  const code = input.countryCode?.toUpperCase() ?? null;
  const home = code ? markets.find((m) => m.countryCode === code) : undefined;
  const config = normalizeBrowseFallback(home?.browseFallback);
  const pool = home ? candidateCities(home, point, exclude) : [];

  if (pool.length === 0) {
    const anywhere = markets
      .flatMap((m) => candidateCities(m, point, exclude))
      .sort(byDistance);
    return anywhere.length > 0
      ? { strategy: "nearest", reason: "nearest", cities: [anywhere[0]] }
      : { strategy: config.strategy, reason: null, cities: [] };
  }

  // With a single launched city there is nothing to choose or rank.
  const only = pool.length === 1;
  const nearest: BrowseSuggestions = {
    strategy: "nearest",
    reason: only ? null : "nearest",
    cities: [pool[0]],
  };

  switch (config.strategy) {
    case "nearest":
      return nearest;
    case "most_active": {
      // `pool` is nearest first, so a strict > keeps the nearer of a tie.
      let best = pool[0];
      for (const city of pool) if (listings(city) > listings(best)) best = city;
      if (listings(best) === 0) return nearest;
      return {
        strategy: "most_active",
        reason: only ? null : "most_active",
        cities: [best],
      };
    }
    case "fixed": {
      const chosen = pool.find((c) => c.region.id === config.regionId);
      if (!chosen) return nearest;
      return {
        strategy: "fixed",
        reason: only ? null : "recommended",
        cities: [chosen],
      };
    }
    default:
      return {
        strategy: "choose",
        reason: null,
        cities: pool.slice(0, config.limit),
      };
  }
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
      browse: browseSuggestions({
        markets,
        point,
        countryCode: inside.countryCode,
        excludeRegionId: inside.region.id,
      }),
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
    browse: browseSuggestions({
      markets,
      point,
      countryCode: market.countryCode,
    }),
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
