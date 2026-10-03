// The single, framework-free definition of the Explore Filter modal's field
// set — shared by the web Explore page
// (apps/web/src/events/organisms/EventsTabContent.tsx +
// PlacesTabContent.tsx) and the native Explore screen
// (apps/mobile/.../(tabs)/index.tsx via
// apps/mobile/src/features/discovery/exploreFilters.ts, which re-exports
// this and adds the RN-only describe/clear/option-list helpers).
//
// The Events tab filters by Category / Types / Price / Date / Rating /
// Distance; the Places tab by Category / Open now / Rating / Distance.
//
// What a filter means is decided in one place, the database
// (_explore_event_candidates for events, get_filtered_places for places),
// and both the rows above the list and the list itself are asked with the
// filters: exploreSections.ts turns these values into what the functions
// take. Nothing is filtered in the browser or on the phone any more, so a
// row and the list under it cannot disagree.

export type EventFilters = {
  category: string | null;
  types: string[];
  minPrice: number | null;
  maxPrice: number | null;
  startDate: string | null; // ISO date (yyyy-mm-dd)
  endDate: string | null;
  minRating: number | null;
  maxDistanceKm: number | null;
};

export type PlaceFilters = {
  categoryId: number | null;
  openNow: boolean;
  minRating: number | null;
  maxDistanceKm: number | null;
};

export const EMPTY_EVENT_FILTERS: EventFilters = {
  category: null,
  types: [],
  minPrice: null,
  maxPrice: null,
  startDate: null,
  endDate: null,
  minRating: null,
  maxDistanceKm: null,
};

export const EMPTY_PLACE_FILTERS: PlaceFilters = {
  categoryId: null,
  openNow: false,
  minRating: null,
  maxDistanceKm: null,
};

// The price slider's top, in cedi-sized units: the slider runs 0 to
// PRICE_ANY_MAX × the market's priceScale, and its top reads "Any". A filter
// with no upper bound carries maxPrice null (never a sentinel number), so a
// ₦5,000 cap is a real cap.
export const PRICE_ANY_MAX = 999;

/** The slider top for a market (display only). */
export function priceSliderMax(priceScale = 1): number {
  const scale = Number.isFinite(priceScale) && priceScale > 0 ? priceScale : 1;
  return Math.max(1, Math.round(PRICE_ANY_MAX * scale));
}

export function countActiveEventFilters(f: EventFilters): number {
  let n = 0;
  if (f.category) n++;
  if (f.types.length) n++;
  if (f.minPrice != null || f.maxPrice != null) n++;
  if (f.startDate || f.endDate) n++;
  if (f.minRating != null) n++;
  if (f.maxDistanceKm != null) n++;
  return n;
}

export function countActivePlaceFilters(f: PlaceFilters): number {
  let n = 0;
  if (f.categoryId != null) n++;
  if (f.openNow) n++;
  if (f.minRating != null) n++;
  if (f.maxDistanceKm != null) n++;
  return n;
}
