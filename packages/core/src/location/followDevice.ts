// How the mobile app's "current area" follows the phone.
//
// The Explore location has two possible owners. When its `source` is
// "device", the phone's own position owns it: the app watches the position
// while it is in the foreground and moves the area with the person. When
// its `source` is "manual", the person chose a place by hand (typed,
// picked on the map, or from autocomplete) and that choice stands until
// they choose again or tap "Use my current location" — the device never
// overrides an explicit choice.
//
// Following is deliberately coarse. A discovery radius is 5–10 km, so a
// position that has moved a few hundred metres shows the same events and
// places; reacting to it would only refetch every location-keyed query and
// flash the screen for nothing. Only a move past SIGNIFICANT_MOVE_METRES
// (a different neighbourhood or town) changes the area. GPS jitter is well
// under that, so a phone lying on a table never "moves".
//
// Framework-free so the decisions are unit tested; the provider in the app
// supplies the position stream, storage and React state.

import { distanceMetres } from "../fieldOps/territory";

export type LatLng = { lat: number; lng: number };

export type LocationSource = "device" | "manual";

export type FollowedLocation = LatLng & {
  label: string;
  /** true when these are the Accra fallback, not a real or chosen position. */
  isFallback: boolean;
  source: LocationSource;
};

/** A move shorter than this keeps the current area (metres). */
export const SIGNIFICANT_MOVE_METRES = 2000;

/**
 * True when `next` is far enough from `current` to count as a different
 * area. With no current position, or a fallback one, any real fix counts.
 */
export function isSignificantMove(
  current: (LatLng & { isFallback?: boolean }) | null,
  next: LatLng,
  thresholdMetres: number = SIGNIFICANT_MOVE_METRES,
): boolean {
  if (!current || current.isFallback) return true;
  return distanceMetres(current, next) >= thresholdMetres;
}

/**
 * Whether a device fix may replace the current location at all: only a
 * location the device owns follows the phone. A manual choice is kept.
 */
export function deviceMayUpdate(current: FollowedLocation | null): boolean {
  return current === null || current.source === "device";
}

/**
 * The location a device fix should produce, or null when nothing should
 * change: the current location is a manual choice, or the fix is not a
 * significant move. `label` is resolved by the caller (reverse geocoding)
 * only when this returns a value, so no geocode request is spent on a fix
 * that changes nothing.
 */
export function nextFollowedLocation(
  current: FollowedLocation | null,
  fix: LatLng,
  thresholdMetres: number = SIGNIFICANT_MOVE_METRES,
): LatLng | null {
  if (!deviceMayUpdate(current)) return null;
  if (!isSignificantMove(current, fix, thresholdMetres)) return null;
  return { lat: fix.lat, lng: fix.lng };
}

/**
 * Validates a stored location read back from disk. Anything malformed is
 * dropped (null) so a bad file can never seed the app with NaN coordinates;
 * a record from before `source` existed is not trusted either — it may have
 * been a "use my current location" that must not be frozen as a choice.
 */
export function parseStoredLocation(raw: unknown): FollowedLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.lat !== "number" || !Number.isFinite(r.lat)) return null;
  if (typeof r.lng !== "number" || !Number.isFinite(r.lng)) return null;
  if (r.lat < -90 || r.lat > 90 || r.lng < -180 || r.lng > 180) return null;
  if (r.source !== "device" && r.source !== "manual") return null;
  if (typeof r.label !== "string" || !r.label) return null;
  return {
    lat: r.lat,
    lng: r.lng,
    label: r.label,
    isFallback: r.isFallback === true,
    source: r.source,
  };
}
