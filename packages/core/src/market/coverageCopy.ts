// The words for an area Abonten hasn't launched in — one place, so the app,
// the website and the launch notice never say it differently. Honest and
// short: what is true now, what they can do instead, and nothing that
// promises a date. The words live under `coverage.*` of the core namespace.

import { intlLocale } from "../i18n/coreStrings";
import type { CoreTranslator } from "../i18n/translator";
import { type DistanceUnit, formatDistance } from "../units/distance";
import {
  type BrowseCity,
  type BrowseStrategy,
  type BrowseSuggestions,
  roundedDistanceKm,
} from "./coverage";

/** "Abonten isn't in Kumasi yet" / "Abonten isn't here yet". */
export function notLaunchedTitle(
  t: CoreTranslator,
  areaName: string | null,
): string {
  return areaName
    ? t("coverage.notLaunchedIn", { area: areaName })
    : t("coverage.notLaunchedHere");
}

export const NOT_LAUNCHED_BODY_KEY = "coverage.body";

export const JOIN_WAITLIST_LABEL_KEY = "coverage.joinWaitlist";

export function waitingText(
  t: CoreTranslator,
  areaName: string | null,
): string {
  return areaName
    ? t("coverage.waitingIn", { area: areaName })
    : t("coverage.waitingHere");
}

export const LEAVE_WAITLIST_LABEL_KEY = "coverage.leaveWaitlist";

/** Heads the launched cities offered instead, whatever the strategy. */
export const BROWSE_ELSEWHERE_TITLE_KEY = "coverage.browseElsewhere";

/**
 * Why a single city is offered, shown next to it so it reads as a
 * suggestion rather than "your" city. Null for a list the person picks from.
 */
export function browseReasonLabel(
  t: CoreTranslator,
  reason: BrowseSuggestions["reason"],
): string | null {
  switch (reason) {
    case "nearest":
    case "most_active":
    case "recommended":
      return t(`coverage.reason.${reason}`);
    default:
      return null;
  }
}

/** "180 km away", in the viewer's unit and language. */
export function cityDistanceText(
  t: CoreTranslator,
  city: BrowseCity,
  unit: DistanceUnit = "km",
  locale?: string | null,
): string {
  return t("coverage.distanceAway", {
    distance: formatDistance(
      roundedDistanceKm(city.distanceKm) * 1000,
      unit,
      intlLocale(locale),
    ),
  });
}

/** "Explore Accra" — the one-tap action when a single city is offered. */
export function exploreCityLabel(t: CoreTranslator, city: BrowseCity): string {
  return t("coverage.exploreCity", { city: city.region.name });
}

export function supplyPrompt(
  t: CoreTranslator,
  areaName: string | null,
): string {
  return areaName
    ? t("coverage.supplyPromptIn", { area: areaName })
    : t("coverage.supplyPromptHere");
}

export const BROWSE_STRATEGIES: readonly BrowseStrategy[] = [
  "choose",
  "nearest",
  "most_active",
  "fixed",
] as const;

/** Admin › Markets: the browse fallback choices, in operator language. */
export function browseStrategyCopy(
  t: CoreTranslator,
  strategy: BrowseStrategy,
): { label: string; help: string } {
  return {
    label: t(`coverage.strategy.${strategy}.label`),
    help: t(`coverage.strategy.${strategy}.help`),
  };
}
