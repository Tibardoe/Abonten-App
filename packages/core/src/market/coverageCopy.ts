// The words for an area Abonten hasn't launched in — one place, so the app,
// the website and the launch notice never say it differently. Honest and
// short: what is true now, what they can do instead, and nothing that
// promises a date.

import { type DistanceUnit, formatDistance } from "../units/distance";
import { type NearestLaunched, roundedDistanceKm } from "./coverage";

/** "Abonten isn't in Kumasi yet" / "Abonten isn't here yet". */
export function notLaunchedTitle(areaName: string | null): string {
  return areaName
    ? `Abonten isn't in ${areaName} yet`
    : "Abonten isn't here yet";
}

export const NOT_LAUNCHED_BODY =
  "We're still bringing events and places here. Anything already listed nearby still shows.";

export const NOT_LAUNCHED_EMPTY_BODY =
  "Nothing is listed here yet. Get a notice when Abonten launches, or browse a city that's open.";

export const JOIN_WAITLIST_LABEL = "Tell me when it launches";

export function waitingText(areaName: string | null): string {
  return areaName
    ? `We'll tell you when Abonten launches in ${areaName}.`
    : "We'll tell you when Abonten launches here.";
}

export const LEAVE_WAITLIST_LABEL = "Stop waiting";

export function browseNearestLabel(nearest: NearestLaunched): string {
  return `Browse ${nearest.region.name}`;
}

/** "250 km away", in the viewer's unit. */
export function nearestDistanceText(
  nearest: NearestLaunched,
  unit: DistanceUnit = "km",
): string {
  return `${formatDistance(roundedDistanceKm(nearest.distanceKm) * 1000, unit)} away`;
}

export function supplyPrompt(areaName: string | null): string {
  return areaName
    ? `Run events or a place in ${areaName}? List them on Abonten.`
    : "Run events or a place here? List them on Abonten.";
}
