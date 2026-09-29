import type { EventFilters, PlaceFilters } from "@abonten/core/exploreFilters";
import { formatMoney } from "@abonten/core/formatMoney";
import {
  SEARCH_RATING_OPTIONS,
  SEARCH_WHEN_OPTIONS,
  type SearchPrice,
  type SearchWhen,
  searchPriceCaps,
  searchPriceOptions,
} from "@abonten/core/search/searchFilters";

// The Explore Filter modal's field set + predicates now live in
// @abonten/core/exploreFilters (shared verbatim with the web Explore page).
// This module re-exports them and adds the React-Native-only presentation
// helpers: the choices the FilterSheet offers (the same When / Price /
// Rating choices as the Search sheet, turned into Explore's dates and
// amounts), the removable-chip descriptors and the per-key clear helpers
// the FilterSheet / ActiveFilterChips use.

export {
  type EventFilters,
  type PlaceFilters,
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  PRICE_ANY_MAX,
  priceSliderMax,
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

// ── Choices ───────────────────────────────────────────────────────────
// Explore stores plain dates and amounts (what get_filtered_events takes);
// the sheet offers the Search sheet's named choices and maps them onto
// those, with "Pick dates" / "Custom range" for anything else.

export type ExploreWhen = SearchWhen | "dates";

export const EXPLORE_WHEN_OPTIONS: { value: ExploreWhen; label: string }[] = [
  ...SEARCH_WHEN_OPTIONS,
  { value: "dates", label: "Pick dates" },
];

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** The days a "When" choice covers, on the phone's calendar. */
export function exploreWhenRange(
  when: SearchWhen,
  now: Date = new Date(),
): { startDate: string; endDate: string } | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (when) {
    case "any":
      return null;
    case "today":
      return { startDate: isoDay(today), endDate: isoDay(today) };
    case "tomorrow": {
      const t = isoDay(addDays(today, 1));
      return { startDate: t, endDate: t };
    }
    case "weekend": {
      // Friday to Sunday: this week's, or the one under way.
      const dow = today.getDay(); // 0 Sunday
      const friday = addDays(today, dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow);
      const start = friday < today ? today : friday;
      return { startDate: isoDay(start), endDate: isoDay(addDays(friday, 2)) };
    }
    case "week":
      return { startDate: isoDay(today), endDate: isoDay(addDays(today, 7)) };
    case "month":
      return { startDate: isoDay(today), endDate: isoDay(addDays(today, 30)) };
  }
}

/** Which "When" choice the filter's dates are ("dates" for any other range). */
export function exploreWhenFor(
  f: Pick<EventFilters, "startDate" | "endDate">,
  now: Date = new Date(),
): ExploreWhen {
  if (!f.startDate && !f.endDate) return "any";
  for (const o of SEARCH_WHEN_OPTIONS) {
    const r = exploreWhenRange(o.value, now);
    if (r && r.startDate === f.startDate && r.endDate === f.endDate) {
      return o.value;
    }
  }
  return "dates";
}

export type ExplorePrice = SearchPrice | "custom";

export function explorePriceOptions(
  currency: string,
  priceScale = 1,
): { value: ExplorePrice; label: string }[] {
  return [
    ...searchPriceOptions(currency, priceScale),
    { value: "custom", label: "Custom range" },
  ];
}

/** The amounts a named price choice stands for. */
export function explorePriceRange(
  price: SearchPrice,
  priceScale = 1,
): { minPrice: number | null; maxPrice: number | null } {
  const caps = searchPriceCaps(priceScale);
  switch (price) {
    case "any":
      return { minPrice: null, maxPrice: null };
    case "free":
      return { minPrice: null, maxPrice: 0 };
    case "under_50":
      return { minPrice: null, maxPrice: caps.under_50 };
    case "under_200":
      return { minPrice: null, maxPrice: caps.under_200 };
  }
}

/** Which price choice the filter's amounts are ("custom" for any other). */
export function explorePriceFor(
  f: Pick<EventFilters, "minPrice" | "maxPrice">,
  priceScale = 1,
): ExplorePrice {
  if (f.minPrice == null && f.maxPrice == null) return "any";
  if (f.minPrice != null && f.minPrice !== 0) return "custom";
  const caps = searchPriceCaps(priceScale);
  if (f.maxPrice === 0) return "free";
  if (f.minPrice == null && f.maxPrice === caps.under_50) return "under_50";
  if (f.minPrice == null && f.maxPrice === caps.under_200) return "under_200";
  return "custom";
}

// Explore browses one area (10 km for events, 20 km for places unless a
// distance is chosen), so its distances stay inside that.
export const EXPLORE_EVENT_DISTANCE_OPTIONS: {
  value: number | null;
  label: string;
}[] = [
  { value: null, label: "Any distance" },
  { value: 1, label: "Within 1 km" },
  { value: 2, label: "Within 2 km" },
  { value: 5, label: "Within 5 km" },
];

export const EXPLORE_PLACE_DISTANCE_OPTIONS: {
  value: number | null;
  label: string;
}[] = [...EXPLORE_EVENT_DISTANCE_OPTIONS, { value: 10, label: "Within 10 km" }];

/** The options, plus the current value when it isn't one of them. */
export function withCurrentDistance(
  options: { value: number | null; label: string }[],
  current: number | null,
): { value: number | null; label: string }[] {
  if (current == null || options.some((o) => o.value === current)) {
    return options;
  }
  return [...options, { value: current, label: `Within ${current} km` }];
}

export const EXPLORE_RATING_OPTIONS = SEARCH_RATING_OPTIONS;

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function shortDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1] ?? ""}`.trim();
}

export type FilterChip = { key: string; label: string };

export function describeEventFilters(
  f: EventFilters,
  /** The browsed market's currency, for the price chip. */
  currency: string,
  /** The market's priceScale, for the named price choices. */
  priceScale = 1,
  now: Date = new Date(),
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.startDate || f.endDate) {
    const when = exploreWhenFor(f, now);
    const named =
      when === "dates"
        ? null
        : EXPLORE_WHEN_OPTIONS.find((o) => o.value === when);
    chips.push({
      key: "date",
      label: named
        ? named.label
        : f.startDate && f.endDate && f.startDate !== f.endDate
          ? `${shortDay(f.startDate)} – ${shortDay(f.endDate)}`
          : shortDay((f.startDate ?? f.endDate) as string),
    });
  }
  if (f.maxDistanceKm != null)
    chips.push({ key: "distance", label: `Within ${f.maxDistanceKm} km` });
  if (f.minPrice != null || f.maxPrice != null) {
    const price = explorePriceFor(f, priceScale);
    const fmt = (v: number) =>
      formatMoney(currency, v, { trimZeroFraction: true });
    chips.push({
      key: "price",
      label:
        price !== "custom"
          ? (explorePriceOptions(currency, priceScale).find(
              (o) => o.value === price,
            )?.label ?? "")
          : f.maxPrice == null
            ? `From ${fmt(f.minPrice ?? 0)}`
            : `${fmt(f.minPrice ?? 0)} – ${fmt(f.maxPrice)}`,
    });
  }
  if (f.category) chips.push({ key: "category", label: f.category });
  for (const type of f.types) chips.push({ key: `type:${type}`, label: type });
  if (f.minRating != null)
    chips.push({ key: "rating", label: `${f.minRating}+ stars` });
  return chips;
}

export function describePlaceFilters(
  f: PlaceFilters,
  categoryName: string | null,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.maxDistanceKm != null)
    chips.push({ key: "distance", label: `Within ${f.maxDistanceKm} km` });
  if (f.categoryId != null && categoryName)
    chips.push({ key: "category", label: categoryName });
  if (f.openNow) chips.push({ key: "openNow", label: "Open now" });
  if (f.minRating != null)
    chips.push({ key: "rating", label: `${f.minRating}+ stars` });
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
