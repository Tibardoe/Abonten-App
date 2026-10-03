import {
  eventCategoryLabel,
  eventTypeLabel,
} from "@abonten/core/categoryLabels";
import type { EventFilters, PlaceFilters } from "@abonten/core/exploreFilters";
import { formatMoney } from "@abonten/core/formatMoney";
import { intlLocale } from "@abonten/core/i18n/coreStrings";
import type { CoreI18n, CoreTranslator } from "@abonten/core/i18n/translator";
import {
  SEARCH_WHEN_VALUES,
  type SearchPrice,
  type SearchWhen,
  searchPriceCaps,
  searchPriceOptions,
  searchRatingOptions,
  searchWhenOptions,
} from "@abonten/core/search/searchFilters";
import { formatDistance } from "@abonten/core/units";

// The Explore Filter modal's field set lives in @abonten/core/exploreFilters
// (shared verbatim with the web Explore page); what a filter means is
// decided in the database. This module re-exports the field set and adds
// the React-Native-only presentation helpers: the choices the FilterSheet
// offers (the same When / Price / Rating choices as the Search sheet,
// turned into Explore's dates and amounts), the removable-chip descriptors
// and the per-key clear helpers the FilterSheet / ActiveFilterChips use.
//
// Everything that produces words takes the reader's translator (the `core`
// namespace) and language: `useCoreI18n()` hands both to a component.

export {
  type EventFilters,
  type PlaceFilters,
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  PRICE_ANY_MAX,
  priceSliderMax,
  countActiveEventFilters,
  countActivePlaceFilters,
} from "@abonten/core/exploreFilters";

export type ExploreTab = "events" | "places";

// ── Choices ───────────────────────────────────────────────────────────
// Explore stores plain dates and amounts (what get_filtered_events takes);
// the sheet offers the Search sheet's named choices and maps them onto
// those, with "Pick dates" / "Custom range" for anything else.

export type ExploreWhen = SearchWhen | "dates";

export function exploreWhenOptions(
  t: CoreTranslator,
): { value: ExploreWhen; label: string }[] {
  return [
    ...searchWhenOptions(t),
    { value: "dates", label: t("filters.pickDates") },
  ];
}

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
      const tomorrow = isoDay(addDays(today, 1));
      return { startDate: tomorrow, endDate: tomorrow };
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
  for (const value of SEARCH_WHEN_VALUES) {
    const r = exploreWhenRange(value, now);
    if (r && r.startDate === f.startDate && r.endDate === f.endDate) {
      return value;
    }
  }
  return "dates";
}

export type ExplorePrice = SearchPrice | "custom";

export function explorePriceOptions(
  t: CoreTranslator,
  currency: string,
  priceScale = 1,
): { value: ExplorePrice; label: string }[] {
  return [
    ...searchPriceOptions(t, currency, priceScale),
    { value: "custom", label: t("filters.customRange") },
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
const EVENT_DISTANCES_KM: readonly (number | null)[] = [null, 1, 2, 5];
const PLACE_DISTANCES_KM: readonly (number | null)[] = [null, 1, 2, 5, 10];

type DistanceOption = { value: number | null; label: string };

function distanceLabel({ t, locale }: CoreI18n, km: number | null): string {
  return km === null
    ? t("filters.anyDistance")
    : t("searchFilters.within", {
        distance: formatDistance(km * 1000, "km", intlLocale(locale)),
      });
}

export function exploreEventDistanceOptions(i18n: CoreI18n): DistanceOption[] {
  return EVENT_DISTANCES_KM.map((value) => ({
    value,
    label: distanceLabel(i18n, value),
  }));
}

export function explorePlaceDistanceOptions(i18n: CoreI18n): DistanceOption[] {
  return PLACE_DISTANCES_KM.map((value) => ({
    value,
    label: distanceLabel(i18n, value),
  }));
}

/** The options, plus the current value when it isn't one of them. */
export function withCurrentDistance(
  i18n: CoreI18n,
  options: DistanceOption[],
  current: number | null,
): DistanceOption[] {
  if (current == null || options.some((o) => o.value === current)) {
    return options;
  }
  return [...options, { value: current, label: distanceLabel(i18n, current) }];
}

export function exploreRatingOptions(i18n: CoreI18n) {
  return searchRatingOptions(i18n);
}

/** "5 Oct" / "5 oct." — a filter day in the reader's language. */
function shortDay(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function starsLabel({ t, locale }: CoreI18n, rating: number): string {
  return t("searchFilters.minStars", {
    rating: new Intl.NumberFormat(intlLocale(locale)).format(rating),
  });
}

export type FilterChip = { key: string; label: string };

export function describeEventFilters(
  i18n: CoreI18n,
  f: EventFilters,
  /** The browsed market's currency, for the price chip. */
  currency: string,
  /** The market's priceScale, for the named price choices. */
  priceScale = 1,
  now: Date = new Date(),
): FilterChip[] {
  const { t, locale } = i18n;
  const chips: FilterChip[] = [];
  if (f.startDate || f.endDate) {
    const when = exploreWhenFor(f, now);
    chips.push({
      key: "date",
      label:
        when !== "dates"
          ? t(`searchFilters.when.${when}`)
          : f.startDate && f.endDate && f.startDate !== f.endDate
            ? t("filters.range", {
                from: shortDay(f.startDate, locale),
                to: shortDay(f.endDate, locale),
              })
            : shortDay((f.startDate ?? f.endDate) as string, locale),
    });
  }
  if (f.maxDistanceKm != null)
    chips.push({
      key: "distance",
      label: distanceLabel(i18n, f.maxDistanceKm),
    });
  if (f.minPrice != null || f.maxPrice != null) {
    const price = explorePriceFor(f, priceScale);
    const fmt = (v: number) =>
      formatMoney(currency, v, { trimZeroFraction: true, locale });
    chips.push({
      key: "price",
      label:
        price !== "custom"
          ? (explorePriceOptions(t, currency, priceScale).find(
              (o) => o.value === price,
            )?.label ?? "")
          : f.maxPrice == null
            ? t("filters.priceFrom", { amount: fmt(f.minPrice ?? 0) })
            : t("filters.range", {
                from: fmt(f.minPrice ?? 0),
                to: fmt(f.maxPrice),
              }),
    });
  }
  if (f.category) {
    chips.push({ key: "category", label: eventCategoryLabel(t, f.category) });
  }
  for (const type of f.types) {
    chips.push({ key: `type:${type}`, label: eventTypeLabel(t, type) });
  }
  if (f.minRating != null)
    chips.push({ key: "rating", label: starsLabel(i18n, f.minRating) });
  return chips;
}

export function describePlaceFilters(
  i18n: CoreI18n,
  f: PlaceFilters,
  /** The chosen category's name, already in the reader's language. */
  categoryName: string | null,
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.maxDistanceKm != null)
    chips.push({
      key: "distance",
      label: distanceLabel(i18n, f.maxDistanceKm),
    });
  if (f.categoryId != null && categoryName)
    chips.push({ key: "category", label: categoryName });
  if (f.openNow)
    chips.push({ key: "openNow", label: i18n.t("searchFilters.openNow") });
  if (f.minRating != null)
    chips.push({ key: "rating", label: starsLabel(i18n, f.minRating) });
  return chips;
}

export function clearEventFilterKey(
  f: EventFilters,
  key: string,
): EventFilters {
  if (key === "category") return { ...f, category: null };
  if (key.startsWith("type:"))
    return { ...f, types: f.types.filter((type) => `type:${type}` !== key) };
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
