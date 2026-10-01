import type { SearchMode, SearchRequest } from "@abonten/types/searchType";
import { eventCategoryLabel } from "../categoryLabels";
import { intlLocale } from "../i18n/coreStrings";
import type { CoreI18n, CoreTranslator } from "../i18n/translator";
import { currencyMinorFactor, isKnownCurrency } from "../money/currencies";
import { formatMoney } from "../money/formatMoney";
import {
  instantToWallClock,
  isValidTimeZone,
  wallClockToInstant,
} from "../time/timeZone";
import { formatDistance } from "../units/distance";

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

// The words for every option live under `searchFilters.*` of the core
// namespace; the lists below are only the values.

export const SEARCH_WHEN_VALUES: readonly SearchWhen[] = [
  "any",
  "today",
  "tomorrow",
  "weekend",
  "week",
  "month",
] as const;

export function searchWhenLabel(t: CoreTranslator, when: SearchWhen): string {
  return t(`searchFilters.when.${when}`);
}

export function searchWhenOptions(
  t: CoreTranslator,
): { value: SearchWhen; label: string }[] {
  return SEARCH_WHEN_VALUES.map((value) => ({
    value,
    label: searchWhenLabel(t, value),
  }));
}

/** km around the chosen location; null = anywhere. */
export const SEARCH_RADIUS_VALUES: readonly (number | null)[] = [
  null,
  5,
  10,
  25,
  50,
] as const;

function radiusLabel({ t, locale }: CoreI18n, km: number | null): string {
  return km === null
    ? t("searchFilters.anywhere")
    : t("searchFilters.within", {
        distance: formatDistance(km * 1000, "km", intlLocale(locale)),
      });
}

export function searchRadiusOptions(
  i18n: CoreI18n,
): { value: number | null; label: string }[] {
  return SEARCH_RADIUS_VALUES.map((value) => ({
    value,
    label: radiusLabel(i18n, value),
  }));
}

/**
 * The price buckets, labelled in the market's currency ("Under ₦50" in
 * Nigeria). The thresholds are in major units of that currency; the search
 * RPC applies them against the listing's own currency.
 */
export const SEARCH_PRICE_VALUES: readonly SearchPrice[] = [
  "any",
  "free",
  "under_50",
  "under_200",
];

/**
 * The two price caps of the search chips, in the market's currency: 50 and
 * 200 scaled by the market's priceScale (₦5,000 and ₦20,000 at scale 100).
 * The keys stay "under_50" / "under_200" so saved links keep working.
 */
export function searchPriceCaps(priceScale = 1): {
  under_50: number;
  under_200: number;
} {
  const scale = Number.isFinite(priceScale) && priceScale > 0 ? priceScale : 1;
  return {
    under_50: Math.max(1, Math.round(50 * scale)),
    under_200: Math.max(1, Math.round(200 * scale)),
  };
}

export function searchPriceOptions(
  t: CoreTranslator,
  currency: string,
  priceScale = 1,
): { value: SearchPrice; label: string }[] {
  const caps = searchPriceCaps(priceScale);
  // Before the market is known the labels carry the bare number.
  const under = (major: number) =>
    t("searchFilters.price.under", {
      amount: isKnownCurrency(currency)
        ? formatMoney(
            { amountMinor: major * currencyMinorFactor(currency), currency },
            { trimZeroFraction: true },
          )
        : String(major),
    });
  return [
    { value: "any", label: t("searchFilters.price.any") },
    { value: "free", label: t("searchFilters.price.free") },
    { value: "under_50", label: under(caps.under_50) },
    { value: "under_200", label: under(caps.under_200) },
  ];
}

/** Minimum average rating; null = any. */
export const SEARCH_RATING_VALUES: readonly (number | null)[] = [
  null,
  3,
  4,
  4.5,
] as const;

function ratingLabel({ t, locale }: CoreI18n, rating: number | null): string {
  return rating === null
    ? t("searchFilters.anyRating")
    : t("searchFilters.minStars", {
        rating: new Intl.NumberFormat(intlLocale(locale)).format(rating),
      });
}

export function searchRatingOptions(
  i18n: CoreI18n,
): { value: number | null; label: string }[] {
  return SEARCH_RATING_VALUES.map((value) => ({
    value,
    label: ratingLabel(i18n, value),
  }));
}

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
  i18n: CoreI18n,
  filters: SearchFilters,
  mode: SearchMode,
  locationLabel: string | null | undefined,
  /** The market currency the price buckets are labelled in. */
  currency: string,
  priceScale = 1,
): { key: SearchFilterKey; label: string }[] {
  const { t, locale } = i18n;
  return activeSearchFilters(filters, mode).map((key) => {
    switch (key) {
      case "when":
        return { key, label: searchWhenLabel(t, filters.when) };
      case "radiusKm": {
        const distance = formatDistance(
          (filters.radiusKm ?? 0) * 1000,
          "km",
          intlLocale(locale),
        );
        return {
          key,
          label: locationLabel
            ? t("searchFilters.withinOf", { distance, location: locationLabel })
            : t("searchFilters.within", { distance }),
        };
      }
      case "price":
        return {
          key,
          label:
            searchPriceOptions(t, currency, priceScale).find(
              (o) => o.value === filters.price,
            )?.label ?? "",
        };
      case "eventCategory":
        return {
          key,
          label: filters.eventCategory
            ? eventCategoryLabel(t, filters.eventCategory)
            : "",
        };
      case "placeCategoryId":
        return {
          key,
          label: filters.placeCategoryName ?? t("searchFilters.category"),
        };
      case "openNow":
        return { key, label: t("searchFilters.openNow") };
      case "minRating":
        return { key, label: ratingLabel(i18n, filters.minRating) };
    }
  });
}

/**
 * The date window for `when`, in the calendar of `timeZone` — the zone of
 * the area being browsed, so "tonight" and "this weekend" mean the local
 * ones in London, Lagos or Tokyo, across daylight-saving changes. Rounded
 * to the hour so the request (and the cache key built from it) stays the
 * same for the rest of the hour instead of changing every render.
 */
export function searchWhenWindow(
  when: SearchWhen,
  now: Date,
  timeZone = "UTC",
): { startDate: string; endDate: string } | null {
  if (when === "any") return null;
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const hour = new Date(now);
  // The top of the hour in the zone (zones with :30/:45 offsets included).
  const local = instantToWallClock(now, zone);
  hour.setTime(
    (
      wallClockToInstant(local.date, `${local.time.slice(0, 2)}:00`, zone) ??
      now
    ).getTime(),
  );
  const [y, m, d] = local.date.split("-").map(Number);
  // Local midnight `n` calendar days from today (a day can be 23 or 25 h).
  const midnight = (n: number): Date => {
    const cal = new Date(Date.UTC(y, m - 1, d + n));
    const iso = cal.toISOString().slice(0, 10);
    return wallClockToInstant(iso, "00:00", zone) ?? cal;
  };
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday
  let start: Date;
  let end: Date;
  switch (when) {
    case "today":
      start = hour;
      end = midnight(1);
      break;
    case "tomorrow":
      start = midnight(1);
      end = midnight(2);
      break;
    case "weekend": {
      // Friday 17:00 to Monday 00:00 local — this week's, or the one under way.
      const toFriday = weekday === 0 ? -2 : 5 - weekday;
      const friday = new Date(Date.UTC(y, m - 1, d + toFriday))
        .toISOString()
        .slice(0, 10);
      start = wallClockToInstant(friday, "17:00", zone) ?? midnight(toFriday);
      end = midnight(toFriday + 3);
      if (start < hour) start = hour;
      break;
    }
    case "week":
      start = hour;
      end = midnight(8);
      break;
    case "month":
      start = hour;
      end = midnight(31);
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
  /** The browsed area's zone, for "today" / "this weekend". */
  timeZone = "UTC",
  /** The browsed market's priceScale, for the price caps. */
  priceScale = 1,
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
    const window = searchWhenWindow(filters.when, now, timeZone);
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
      out.maxPrice = searchPriceCaps(priceScale).under_50;
    } else if (filters.price === "under_200") {
      out.maxPrice = searchPriceCaps(priceScale).under_200;
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
    when: SEARCH_WHEN_VALUES.includes(when as SearchWhen)
      ? (when as SearchWhen)
      : "any",
    radiusKm: SEARCH_RADIUS_VALUES.includes(km) ? km : null,
    price: SEARCH_PRICE_VALUES.includes(price as SearchPrice)
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
    minRating: SEARCH_RATING_VALUES.includes(rating) ? rating : null,
  };
}
