// The Explore rows of places (Around you, Open now, Top rated) and the
// arguments of the function that makes them, for the website and the app.
//
// The rows come from get_explore_place_sections in one call, "All places"
// from get_filtered_places. Both read the reader's filters by the same
// database rule, so a row and the list below it agree. Featured places are
// paid placement and come from get_active_place_promotions.

import type { PlaceFilters } from "./exploreFilters";

export const EXPLORE_PLACE_SECTIONS = [
  "aroundYou",
  "openNow",
  "topRated",
] as const;

export type ExplorePlaceSection = (typeof EXPLORE_PLACE_SECTIONS)[number];

export type ExplorePlaceSections<T> = Record<ExplorePlaceSection, T[]>;

/** The area the Places tab browses, and the smaller one "Around you" means. */
export const EXPLORE_PLACES_RADIUS_KM = 20;
export const EXPLORE_PLACES_AROUND_YOU_KM = 5;

/** "Top rated" means at least this many stars (or the reader's own filter). */
export const EXPLORE_TOP_RATED_MIN_RATING = 4;

/** How many places each row holds. */
export const EXPLORE_PLACE_SECTION_SIZES: Record<ExplorePlaceSection, number> =
  {
    aroundYou: 20,
    openNow: 10,
    topRated: 20,
  };

/**
 * Arguments of get_explore_place_sections. A filter that is not set is
 * left out (every one is DEFAULT NULL in SQL) rather than sent as null. A
 * chosen distance narrows the whole area, and "Around you" with it; "open
 * now" and a rating narrow every row.
 */
export function explorePlaceSectionArgs(input: {
  lat: number | null;
  lng: number | null;
  filters: PlaceFilters;
}) {
  const radiusKm = input.filters.maxDistanceKm ?? EXPLORE_PLACES_RADIUS_KM;
  return {
    // No point (the address could not be placed): the rows are not about
    // distance, as in get_filtered_places.
    p_user_lat: input.lat ?? undefined,
    p_user_lng: input.lng ?? undefined,
    p_radius_km: radiusKm,
    p_around_km: Math.min(EXPLORE_PLACES_AROUND_YOU_KM, radiusKm),
    p_category_id: input.filters.categoryId ?? undefined,
    p_min_rating: input.filters.minRating ?? undefined,
    p_open_now: input.filters.openNow ? true : undefined,
    p_top_rated_min: EXPLORE_TOP_RATED_MIN_RATING,
    p_around_size: EXPLORE_PLACE_SECTION_SIZES.aroundYou,
    p_open_now_size: EXPLORE_PLACE_SECTION_SIZES.openNow,
    p_top_rated_size: EXPLORE_PLACE_SECTION_SIZES.topRated,
  };
}

export function emptyExplorePlaceSections<T>(): ExplorePlaceSections<T> {
  return { aroundYou: [], openNow: [], topRated: [] };
}

/**
 * The function returns each place once, with `sections` saying which rows
 * it belongs to and where ({"aroundYou": 3, "topRated": 1}). This lays the
 * places out as rows, each in its own order.
 */
export function splitExplorePlaceSections<T extends { sections?: unknown }>(
  rows: readonly T[],
): ExplorePlaceSections<T> {
  const placed = emptyExplorePlaceSections<{ row: T; position: number }>();
  for (const row of rows) {
    const sections = row.sections;
    if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
      continue;
    }
    for (const name of EXPLORE_PLACE_SECTIONS) {
      const position = (sections as Record<string, unknown>)[name];
      if (typeof position === "number" && Number.isFinite(position)) {
        placed[name].push({ row, position });
      }
    }
  }
  const out = emptyExplorePlaceSections<T>();
  for (const name of EXPLORE_PLACE_SECTIONS) {
    out[name] = placed[name]
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.row);
  }
  return out;
}
