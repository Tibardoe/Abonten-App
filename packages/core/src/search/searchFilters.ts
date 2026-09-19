import type { SearchMode, SearchRequest } from "@abonten/types/searchType";

// Filters for global search (Discovery). Deliberately NOT the Explore
// event/place filters: those browse one kind of listing around a place;
// this narrows a text search that can return events, places and organizers
// at once. So every filter says which result types it applies to, the sheet
// only offers the ones that fit the tab you are on, and a filter that does
// not apply to a tab is simply not sent for it (it is kept, not cleared,
// so switching back to Events restores "This weekend").
//
// Dimensions are the ones people actually narrow a search by: when (events),
// how far (events, places), price (events), open now (places), category
// (events, places) and rating (events, places). Organizer search has none.

export type SearchWhen =
  | "any"
  | "today"
  | "tomorrow"
  | "weekend"
  | "week"
  | "month";
export type SearchPrice = "any" | "free" | "under_50" | "under_200";

export type SearchFilters = {
  when: SearchWhen;
  /** km around the chosen location; null = anywhere. */
  radiusKm: number | null;
  price: SearchPrice;
  /** An event category name, as stored on events. */
  eventCategory: string | null;
  /** A place_category id. */
  placeCategoryId: number | null;
  placeCategoryName: string | null;
  openNow: boolean;
  /** Minimum average rating (e.g. 4). */
  minRating: number | null;
};

export type SearchFilterKey =
  | "when"
  | "radiusKm"
  | "price"
  | "eventCategory"
  | "placeCategoryId"
  | "openNow"
  | "minRating";

export const EMPTY_SEARCH_FILTERS: SearchFilters = {
  when: "any",
  radiusKm: null,
  price: "any",
  eventCategory: null,
  placeCategoryId: null,
  placeCategoryName: null,
  openNow: false,
  minRating: null,
};

export const SEARCH_WHEN_OPTIONS: { value: SearchWhen; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "weekend", label: "This weekend" },
  { value: "week", label: "Next 7 days" },
  { value: "month", label: "Next 30 days" },
];

export const SEARCH_RADIUS_OPTIONS: { value: number | null; label: string }[] =
  [
    { value: null, label: "Anywhere" },
    { value: 5, label: "Within 5 km" },
    { value: 10, label: "Within 10 km" },
    { value: 25, label: "Within 25 km" },
    { value: 50, label: "Within 50 km" },
  ];

export const SEARCH_PRICE_OPTIONS: { value: SearchPrice; label: string }[] = [
  { value: "any", label: "Any price" },
  { value: "free", label: "Free" },
  { value: "under_50", label: "Under GH₵50" },
  { value: "under_200", label: "Under GH₵200" },
];

export const SEARCH_RATING_OPTIONS: { value: number | null; label: string }[] =
  [
    { value: null, label: "Any rating" },
    { value: 3, label: "3+ stars" },
    { value: 4, label: "4+ stars" },
    { value: 4.5, label: "4.5+ stars" },
  ];

type Scope = "event" | "place";

/** Which result types each filter narrows. */
export const SEARCH_FILTER_SCOPE: Record<SearchFilterKey, readonly Scope[]> = {
  when: ["event"],
  radiusKm: ["event", "place"],
  price: ["event"],
  eventCategory: ["event"],
  placeCategoryId: ["place"],
  openNow: ["place"],
  minRating: ["event", "place"],
};

function scopesFor(mode: SearchMode): readonly Scope[] {
  if (mode === "events") return ["event"];
  if (mode === "places") return ["place"];
  if (mode === "all") return ["event", "place"];
  return [];
}

/** The filters the sheet offers on this tab. */
export function searchFiltersFor(mode: SearchMode): SearchFilterKey[] {
  const scopes = scopesFor(mode);
  return (Object.keys(SEARCH_FILTER_SCOPE) as SearchFilterKey[]).filter((k) =>
    SEARCH_FILTER_SCOPE[k].some((s) => scopes.includes(s)),
  );
}

function isSet(filters: SearchFilters, key: SearchFilterKey): boolean {
  switch (key) {
    case "when":
      return filters.when !== "any";
    case "radiusKm":
      return filters.radiusKm !== null;
    case "price":
      return filters.price !== "any";
    case "eventCategory":
      return !!filters.eventCategory;
    case "placeCategoryId":
      return filters.placeCategoryId !== null;
    case "openNow":
      return filters.openNow;
    case "minRating":
      return filters.minRating !== null;
  }
}

/** Filters that are set AND apply to this tab. */
export function activeSearchFilters(
  filters: SearchFilters,
  mode: SearchMode,
): SearchFilterKey[] {
  return searchFiltersFor(mode).filter((k) => isSet(filters, k));
}

export function clearSearchFilter(
  filters: SearchFilters,
  key: SearchFilterKey,
): SearchFilters {
  switch (key) {
    case "placeCategoryId":
      return { ...filters, placeCategoryId: null, placeCategoryName: null };
    default:
      return { ...filters, [key]: EMPTY_SEARCH_FILTERS[key] };
  }
}

/** Removes every filter that applies to this tab; others are kept. */
export function clearSearchFiltersFor(
  filters: SearchFilters,
  mode: SearchMode,
): SearchFilters {
  return searchFiltersFor(mode).reduce(clearSearchFilter, filters);
}

/** Short labels for the chips under the search bar. */
export function describeSearchFilters(
  filters: SearchFilters,
  mode: SearchMode,
  locationLabel?: string | null,
): { key: SearchFilterKey; label: string }[] {
  return activeSearchFilters(filters, mode).map((key) => {
    switch (key) {
      case "when":
        return {
          key,
          label:
            SEARCH_WHEN_OPTIONS.find((o) => o.value === filters.when)?.label ??
            "",
        };
      case "radiusKm":
        return {
          key,
          label: `Within ${filters.radiusKm} km${locationLabel ? ` of ${locationLabel}` : ""}`,
        };
      case "price":
        return {
          key,
          label:
            SEARCH_PRICE_OPTIONS.find((o) => o.value === filters.price)
              ?.label ?? "",
        };
      case "eventCategory":
        return { key, label: filters.eventCategory ?? "" };
      case "placeCategoryId":
        return { key, label: filters.placeCategoryName ?? "Category" };
      case "openNow":
        return { key, label: "Open now" };
      case "minRating":
        return { key, label: `${filters.minRating}+ stars` };
    }
  });
}

/**
 * The date window for `when`, in Africa/Accra (UTC+0, no daylight saving),
 * rounded to the hour so the request — and the cache key built from it —
 * stays the same for the rest of the hour instead of changing every render.
 */
export function searchWhenWindow(
  when: SearchWhen,
  now: Date,
): { startDate: string; endDate: string } | null {
  if (when === "any") return null;
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  const dayStart = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const addDays = (d: Date, n: number) =>
    new Date(d.getTime() + n * 86_400_000);
  const today = dayStart(now);
  let start: Date;
  let end: Date;
  switch (when) {
    case "today":
      start = hour;
      end = addDays(today, 1);
      break;
    case "tomorrow":
      start = addDays(today, 1);
      end = addDays(today, 2);
      break;
    case "weekend": {
      // Friday 17:00 to Monday 00:00 — this week's, or the one under way.
      const dow = today.getUTCDay(); // 0 Sunday … 6 Saturday
      const toFriday = dow === 0 ? -2 : 5 - dow;
      const friday = addDays(today, toFriday);
      start = new Date(friday.getTime() + 17 * 3_600_000);
      end = addDays(friday, 3);
      if (start < hour) start = hour;
      break;
    }
    case "week":
      start = hour;
      end = addDays(today, 8);
      break;
    case "month":
      start = hour;
      end = addDays(today, 31);
      break;
  }
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/**
 * The request fields for this tab. Filters for result types the tab does
 * not show are left out, so they never narrow the wrong list. Distance is
 * sent only with a location to measure from.
 */
export function searchFiltersToRequest(
  filters: SearchFilters,
  mode: SearchMode,
  now: Date,
  origin: { lat: number; lng: number } | null,
): Partial<SearchRequest> {
  const active = new Set(activeSearchFilters(filters, mode));
  const out: Partial<SearchRequest> = {};
  if (origin) {
    out.lat = origin.lat;
    out.lng = origin.lng;
    if (active.has("radiusKm") && filters.radiusKm !== null) {
      out.radiusKm = filters.radiusKm;
    }
  }
  if (active.has("when")) {
    const window = searchWhenWindow(filters.when, now);
    if (window) {
      out.startDate = window.startDate;
      out.endDate = window.endDate;
    }
  }
  if (active.has("price")) {
    if (filters.price === "free") {
      out.minPrice = 0;
      out.maxPrice = 0;
    } else if (filters.price === "under_50") {
      out.maxPrice = 50;
    } else if (filters.price === "under_200") {
      out.maxPrice = 200;
    }
  }
  if (active.has("eventCategory") && filters.eventCategory) {
    out.category = filters.eventCategory;
  }
  if (active.has("placeCategoryId") && filters.placeCategoryId !== null) {
    out.placeCategoryId = filters.placeCategoryId;
  }
  if (active.has("openNow")) out.openNow = true;
  if (active.has("minRating") && filters.minRating !== null) {
    out.minRating = filters.minRating;
  }
  return out;
}

/**
 * Whether a tab can show results with no text: a category is enough to
 * browse (the service lists a category's events or places without a query).
 */
export function canBrowseWithoutQuery(
  filters: SearchFilters,
  mode: SearchMode,
): boolean {
  const active = new Set(activeSearchFilters(filters, mode));
  return active.has("eventCategory") || active.has("placeCategoryId");
}

// ── Link form ─────────────────────────────────────────────────────────
// So a filtered search is deep-linkable: flat string params, unknown or
// malformed values ignored.

export function searchFiltersToParams(
  filters: SearchFilters,
): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.when !== "any") p.when = filters.when;
  if (filters.radiusKm !== null) p.km = String(filters.radiusKm);
  if (filters.price !== "any") p.price = filters.price;
  if (filters.eventCategory) p.cat = filters.eventCategory;
  if (filters.placeCategoryId !== null) {
    p.pcat = String(filters.placeCategoryId);
    if (filters.placeCategoryName) p.pcatName = filters.placeCategoryName;
  }
  if (filters.openNow) p.open = "1";
  if (filters.minRating !== null) p.rating = String(filters.minRating);
  return p;
}

export function searchFiltersFromParams(
  params: Record<string, string | string[] | undefined>,
): SearchFilters {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const when = one("when");
  const km = Number(one("km"));
  const price = one("price");
  const pcat = Number(one("pcat"));
  const rating = Number(one("rating"));
  return {
    when: SEARCH_WHEN_OPTIONS.some((o) => o.value === when)
      ? (when as SearchWhen)
      : "any",
    radiusKm: SEARCH_RADIUS_OPTIONS.some((o) => o.value === km) ? km : null,
    price: SEARCH_PRICE_OPTIONS.some((o) => o.value === price)
      ? (price as SearchPrice)
      : "any",
    eventCategory: one("cat")?.slice(0, 80) || null,
    placeCategoryId:
      Number.isInteger(pcat) && pcat > 0 && pcat < 32768 ? pcat : null,
    placeCategoryName:
      Number.isInteger(pcat) && pcat > 0
        ? (one("pcatName")?.slice(0, 80) ?? null)
        : null,
    openNow: one("open") === "1",
    minRating: SEARCH_RATING_OPTIONS.some((o) => o.value === rating)
      ? rating
      : null,
  };
}
