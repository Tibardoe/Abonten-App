// The words for an area Abonten hasn't launched in — one place, so the app,
// the website and the launch notice never say it differently. Honest and
// short: what is true now, what they can do instead, and nothing that
// promises a date.

import { type DistanceUnit, formatDistance } from "../units/distance";
import {
  type BrowseCity,
  type BrowseStrategy,
  type BrowseSuggestions,
  roundedDistanceKm,
} from "./coverage";

/** "Abonten isn't in Kumasi yet" / "Abonten isn't here yet". */
export function notLaunchedTitle(areaName: string | null): string {
  return areaName
    ? `Abonten isn't in ${areaName} yet`
    : "Abonten isn't here yet";
}

export const NOT_LAUNCHED_BODY =
  "We're still bringing events and places here. Anything already listed nearby still shows.";

export const JOIN_WAITLIST_LABEL = "Tell me when it launches";

export function waitingText(areaName: string | null): string {
  return areaName
    ? `We'll tell you when Abonten launches in ${areaName}.`
    : "We'll tell you when Abonten launches here.";
}

export const LEAVE_WAITLIST_LABEL = "Stop waiting";

/** Heads the launched cities offered instead, whatever the strategy. */
export const BROWSE_ELSEWHERE_TITLE = "Explore what's happening elsewhere";

/**
 * Why a single city is offered, shown next to it so it reads as a
 * suggestion rather than "your" city. Null for a list the person picks from.
 */
export function browseReasonLabel(
  reason: BrowseSuggestions["reason"],
): string | null {
  switch (reason) {
    case "nearest":
      return "Nearest";
    case "most_active":
      return "Most listings";
    case "recommended":
      return "Suggested";
    default:
      return null;
  }
}

/** "180 km away", in the viewer's unit. */
export function cityDistanceText(
  city: BrowseCity,
  unit: DistanceUnit = "km",
): string {
  return `${formatDistance(roundedDistanceKm(city.distanceKm) * 1000, unit)} away`;
}

/** "Explore Accra" — the one-tap action when a single city is offered. */
export function exploreCityLabel(city: BrowseCity): string {
  return `Explore ${city.region.name}`;
}

export function supplyPrompt(areaName: string | null): string {
  return areaName
    ? `Run events or a place in ${areaName}? List them on Abonten.`
    : "Run events or a place here? List them on Abonten.";
}

/** Admin › Markets: the browse fallback choices, in operator language. */
export const BROWSE_STRATEGY_COPY: Record<
  BrowseStrategy,
  { label: string; help: string }
> = {
  choose: {
    label: "Let people choose",
    help: "Show a short list of launched cities, nearest first, and let the person pick.",
  },
  nearest: {
    label: "Nearest launched city",
    help: "Suggest the closest launched city, marked “Nearest”.",
  },
  most_active: {
    label: "Most active launched city",
    help: "Suggest the launched city with the most upcoming events and places listed in its area (the counts under each city below), marked “Most listings”. A tie goes to the nearer city; if no city has any listings, the nearest is suggested.",
  },
  fixed: {
    label: "A city you choose",
    help: "Always suggest the city you pick, marked “Suggested”. If it is later made coming soon, deactivated or removed, the nearest launched city is suggested instead.",
  },
};
