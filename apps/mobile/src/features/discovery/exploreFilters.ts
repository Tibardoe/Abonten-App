import { distances, rating } from "@abonten/core/distanceAndRating";
import { parseEventTypes } from "@abonten/core/parseEventTypes";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";

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

// ---------------------------------------------------------------------------
// Client-side predicates — so the curated Explore sliders (Around You,
// Happening Today/Week/Month, Featured, Open Now, Top Rated) honour the
// filter sheet instead of only the "All" list doing so. They run against the
// single bounded nearby fetch every slider is already derived from, so this
// adds no network. A dimension the discovery payload can't express falls
// through as "matches" (see eventFiltersNeedServerData for the one case that
// forces the curated block to collapse instead).
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Every session start for an event (occurrences, else the main starts_at). */
function eventStarts(event: UserPostType): number[] {
  const occ =
    event.occurrences && event.occurrences.length > 0
      ? event.occurrences
      : (event.event_occurrence ?? []);
  const raw =
    occ.length > 0
      ? occ.map((o) => o.starts_at)
      : event.starts_at
        ? [event.starts_at]
        : [];
  return raw
    .map((s) => new Date(s as unknown as string).getTime())
    .filter((t) => !Number.isNaN(t));
}

function eventPrice(event: UserPostType): number | null {
  const candidates = [
    event.min_price,
    event.minTicket?.price,
    event.ticket_price,
    event.ticket_type?.[0]?.price,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && !Number.isNaN(c)) return c;
  }
  return null;
}

function eventCoords(event: UserPostType): { lat: number; lng: number } | null {
  if (!event.location || typeof event.location !== "string") return null;
  try {
    const { eventLat, eventLng } = parseWKBHex(event.location);
    if (Number.isNaN(eventLat) || Number.isNaN(eventLng)) return null;
    return { lat: eventLat, lng: eventLng };
  } catch {
    return null;
  }
}

/**
 * The Explore Events tab's nearby payload carries no rating, so a
 * `minRating` filter can't be honoured on the curated sliders. When it's
 * set the screen collapses the curated block and leans on the "All" list
 * (which filters by rating server-side) rather than showing rows that
 * silently ignore the constraint.
 */
export function eventFiltersNeedServerData(f: EventFilters): boolean {
  return f.minRating != null;
}

export function eventMatchesFilters(
  event: UserPostType,
  f: EventFilters,
  userCoords: { lat: number; lng: number } | null,
): boolean {
  if (f.category && event.event_category !== f.category) return false;

  if (f.types.length > 0) {
    const eventTypes = parseEventTypes(
      (event as { event_type?: unknown }).event_type,
    );
    if (!f.types.some((t) => eventTypes.includes(t))) return false;
  }

  if (
    f.minPrice != null ||
    (f.maxPrice != null && f.maxPrice < PRICE_ANY_MAX)
  ) {
    const price = eventPrice(event) ?? 0;
    if (f.minPrice != null && price < f.minPrice) return false;
    if (f.maxPrice != null && f.maxPrice < PRICE_ANY_MAX && price > f.maxPrice)
      return false;
  }

  if (f.startDate || f.endDate) {
    const starts = eventStarts(event);
    if (starts.length === 0) return false;
    const from = f.startDate
      ? new Date(`${f.startDate}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const to = f.endDate
      ? new Date(`${f.endDate}T23:59:59`).getTime()
      : Number.POSITIVE_INFINITY;
    if (!starts.some((t) => t >= from && t <= to)) return false;
  }

  if (f.maxDistanceKm != null && userCoords) {
    const known =
      typeof event.distance_km === "number"
        ? event.distance_km
        : (() => {
            const ec = eventCoords(event);
            return ec ? haversineKm(userCoords, ec) : null;
          })();
    if (known != null && known > f.maxDistanceKm) return false;
  }

  return true;
}

export function placeMatchesFilters(
  place: PlaceType,
  f: PlaceFilters,
): boolean {
  if (f.categoryId != null && place.category_id !== f.categoryId) return false;
  if (f.openNow && !place.is_open) return false;
  if (f.minRating != null && (place.avg_rating ?? 0) < f.minRating)
    return false;
  if (
    f.maxDistanceKm != null &&
    typeof place.distance_km === "number" &&
    place.distance_km > f.maxDistanceKm
  )
    return false;
  return true;
}

export function filterEventList(
  events: UserPostType[],
  f: EventFilters,
  userCoords: { lat: number; lng: number } | null,
): UserPostType[] {
  if (countActiveEventFilters(f) === 0) return events;
  return events.filter((e) => eventMatchesFilters(e, f, userCoords));
}

export function filterPlaceList(
  places: PlaceType[],
  f: PlaceFilters,
): PlaceType[] {
  if (countActivePlaceFilters(f) === 0) return places;
  return places.filter((p) => placeMatchesFilters(p, f));
}
