import { intlLocale } from "./i18n/coreStrings";
import type { CoreTranslator } from "./i18n/translator";

// The distance and rating choices of the Explore filter. The `value` is
// what goes in the link (?distance=Up to 3km&rating=From 4.5) and is read
// back by parseFilterModalQueries, so it stays the same in every language;
// the `label` is what the person sees (`filters.*` of the core namespace).

export const DISTANCE_STEPS_KM: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];
export const RATING_STEPS: readonly number[] = [4.4, 4.5, 4.6, 4.7, 4.8, 4.9];

export const distances: readonly string[] = DISTANCE_STEPS_KM.map(
  (km) => `Up to ${km}km`,
);

export const rating: readonly string[] = RATING_STEPS.map((r) => `From ${r}`);

export function distanceFilterOptions(
  t: CoreTranslator,
  locale?: string | null,
): { value: string; label: string }[] {
  const number = new Intl.NumberFormat(intlLocale(locale));
  return DISTANCE_STEPS_KM.map((km, i) => ({
    value: distances[i],
    label: t("filters.upTo", { distance: `${number.format(km)} km` }),
  }));
}

export function ratingFilterOptions(
  t: CoreTranslator,
  locale?: string | null,
): { value: string; label: string }[] {
  const number = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 1,
  });
  return RATING_STEPS.map((r, i) => ({
    value: rating[i],
    label: t("filters.ratingFrom", { rating: number.format(r) }),
  }));
}
