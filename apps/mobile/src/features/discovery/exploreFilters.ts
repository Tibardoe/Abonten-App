import { distances, rating } from "@abonten/core/distanceAndRating";
import {
  type EventFilters,
  PRICE_ANY_MAX,
  type PlaceFilters,
} from "@abonten/core/exploreFilters";

// The Explore Filter modal's field set + predicates now live in
// @abonten/core/exploreFilters (shared verbatim with the web Explore page).
// This module re-exports them and adds the React-Native-only presentation
// helpers: the Distance/Rating option lists, the removable-chip descriptors
// and the per-key clear helpers the FilterSheet / ActiveFilterChips use.

export {
  type EventFilters,
  type PlaceFilters,
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  PRICE_ANY_MAX,
  countActiveEventFilters,
  countActivePlaceFilters,
  eventFiltersNeedServerData,
  eventMatchesFilters,
  placeMatchesFilters,
  filterEventList,
  filterPlaceList,
  haversineKm,
} from "@abonten/core/exploreFilters";

export type ExploreTab = "events" | "places";

// Shared option lists, same source as the web modal's Distance / Rating
// dropdowns ("Up to 5km" -> 5, "From 4.5" -> 4.5).
export const DISTANCE_OPTIONS: { label: string; km: number }[] = distances.map(
  (label) => ({ label, km: Number(label.match(/[\d.]+/)?.[0] ?? 0) }),
);

export const RATING_OPTIONS: { label: string; value: number }[] = rating.map(
  (label) => ({ label, value: Number(label.match(/[\d.]+/)?.[0] ?? 0) }),
);

export type FilterChip = { key: string; label: string };

export function describeEventFilters(f: EventFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.category) chips.push({ key: "category", label: f.category });
  for (const type of f.types) chips.push({ key: `type:${type}`, label: type });
  if (
    f.minPrice != null ||
    (f.maxPrice != null && f.maxPrice < PRICE_ANY_MAX)
  ) {
    const min = f.minPrice ?? 0;
    const max =
      f.maxPrice != null && f.maxPrice < PRICE_ANY_MAX
        ? `${f.maxPrice}`
        : "Any";
    chips.push({ key: "price", label: `GHS ${min} – ${max}` });
  }
  if (f.startDate || f.endDate) {
    chips.push({
      key: "date",
      label:
        f.startDate && f.endDate
          ? `${f.startDate} → ${f.endDate}`
          : (f.startDate ?? f.endDate ?? ""),
    });
  }
  if (f.minRating != null)
    chips.push({ key: "rating", label: `From ${f.minRating}★` });
  if (f.maxDistanceKm != null)
    chips.push({ key: "distance", label: `Up to ${f.maxDistanceKm}km` });
  return chips;
}

export function describePlaceFilters(
  f: PlaceFilters,
  categoryName: string | null,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.categoryId != null && categoryName)
    chips.push({ key: "category", label: categoryName });
  if (f.openNow) chips.push({ key: "openNow", label: "Open now" });
  if (f.minRating != null)
    chips.push({ key: "rating", label: `From ${f.minRating}★` });
  if (f.maxDistanceKm != null)
    chips.push({ key: "distance", label: `Up to ${f.maxDistanceKm}km` });
  return chips;
}

export function clearEventFilterKey(
  f: EventFilters,
  key: string,
): EventFilters {
  if (key === "category") return { ...f, category: null };
  if (key.startsWith("type:"))
    return { ...f, types: f.types.filter((t) => `type:${t}` !== key) };
  if (key === "price") return { ...f, minPrice: null, maxPrice: null };
  if (key === "date") return { ...f, startDate: null, endDate: null };
  if (key === "rating") return { ...f, minRating: null };
  if (key === "distance") return { ...f, maxDistanceKm: null };
  return f;
}

export function clearPlaceFilterKey(
  f: PlaceFilters,
  key: string,
): PlaceFilters {
  if (key === "category") return { ...f, categoryId: null };
  if (key === "openNow") return { ...f, openNow: false };
  if (key === "rating") return { ...f, minRating: null };
  if (key === "distance") return { ...f, maxDistanceKm: null };
  return f;
}
