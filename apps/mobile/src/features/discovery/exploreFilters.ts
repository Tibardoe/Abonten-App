import { distances, rating } from "@abonten/core/distanceAndRating";

// Native mirror of the web Filter modal's field set (see
// apps/web/src/components/organisms/FilterModalPopup.tsx). The Events tab
// filters by Category / Types / Price / Date / Rating / Distance; the
// Places tab by Category / Open now / Rating / Distance. Kept as plain data
// + pure helpers so both the sheet and the Explore screen share one
// definition of "what is active" and "how to describe it".

export type ExploreTab = "events" | "places";

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

// "[0, 999]" is the web modal's "Any price" sentinel — 999 renders as
// "Any" there, so treat a max of 999+ as "no upper bound".
export const PRICE_ANY_MAX = 999;

// Shared option lists, same source as the web modal's Distance / Rating
// dropdowns ("Up to 5km" -> 5, "From 4.5" -> 4.5).
export const DISTANCE_OPTIONS: { label: string; km: number }[] = distances.map(
  (label) => ({ label, km: Number(label.match(/[\d.]+/)?.[0] ?? 0) }),
);

export const RATING_OPTIONS: { label: string; value: number }[] = rating.map(
  (label) => ({ label, value: Number(label.match(/[\d.]+/)?.[0] ?? 0) }),
);

export function countActiveEventFilters(f: EventFilters): number {
  let n = 0;
  if (f.category) n++;
  if (f.types.length) n++;
  if (f.minPrice != null || (f.maxPrice != null && f.maxPrice < PRICE_ANY_MAX))
    n++;
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
