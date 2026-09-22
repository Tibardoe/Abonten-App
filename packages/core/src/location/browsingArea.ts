// The mobile app's browsing area — the one answer to "where is Abonten
// showing me things?" — and how it relates to where the phone actually is.
//
// Two facts are kept apart:
//
//   * the phone's position — where the person physically is; and
//   * the browsing area — the place the app shows events, places, Spotlights
//     and search results for.
//
// Most of the time they are the same place, and the area FOLLOWS the phone
// (`mode: "following"`): the app watches the position while it is open and
// moves the area when the person arrives somewhere else. When the person
// chooses a place by hand (typed, autocomplete, the map picker) the area is
// CHOSEN (`mode: "chosen"`): it stands wherever the phone goes, across
// restarts, until they choose again or hand it back to the phone.
//
// A chosen area can be forgotten. Someone who picked Accra while in Kumasi,
// then travelled on, would otherwise keep seeing Accra with no hint why. So
// while the area is chosen and the phone is demonstrably somewhere else —
// far from the chosen area AND far from where the phone was when they chose
// it — the app may SUGGEST switching ("You're now in Tamale"), once per
// place: dismissing it anchors the suggestion to where the phone is, and it
// only comes back after the phone has moved on again. A person who chose
// Osu while standing in Labadi is never nagged, because the phone has not
// moved since they chose.
//
// Following is deliberately coarse. A discovery radius is 5–20 km, so a
// position that has moved a few hundred metres shows the same things;
// reacting to it would only refetch every location-keyed query and flash
// the screen for nothing. Only a move past SIGNIFICANT_MOVE_METRES changes
// the area, and a fix cannot prove a move shorter than its own accuracy
// (approximate location on Android is accurate to kilometres), so
// approximate fixes never make the area wander.
//
// Framework-free so every decision is unit tested; the provider in the app
// supplies the position stream, storage and React state.

import { distanceMetres } from "../fieldOps/territory";

export type LatLng = { lat: number; lng: number };

/** A position from the phone; `accuracy` is its radius in metres, if known. */
export type PositionFix = LatLng & { accuracy?: number | null };

export type AreaMode = "following" | "chosen";

export type BrowsingArea = LatLng & {
  /** What the person sees: "Kumasi", "Osu, Accra, Ghana", "Your location". */
  label: string;
  mode: AreaMode;
  /** true when these are the Accra default, not a real or chosen position. */
  isFallback: boolean;
};

export type LocationState = {
  area: BrowsingArea;
  /**
   * Where the phone was when the area was chosen, or where it was when the
   * "you're now in…" suggestion was last dismissed. Null when the position
   * was unknown at the time. Only meaningful while `area.mode` is "chosen".
   */
  anchor: LatLng | null;
};

/** A move shorter than this keeps a following area (metres). */
export const SIGNIFICANT_MOVE_METRES = 2000;

/**
 * How far the phone must be from a chosen area, and from where it was when
 * the area was chosen (or the suggestion last dismissed), before the app
 * suggests switching to the current location. Deliberately a different
 * town, not a different neighbourhood: a suggestion asks the person to give
 * up a deliberate choice, so it needs a higher bar than the silent
 * re-centring of a following area.
 */
export const AREA_MISMATCH_METRES = 10_000;

/**
 * True when `next` is far enough from `current` to count as a different
 * area. With no current position, or a fallback one, any real fix counts.
 * A fix cannot prove a move shorter than twice its own accuracy radius.
 */
export function isSignificantMove(
  current: (LatLng & { isFallback?: boolean }) | null,
  next: PositionFix,
  thresholdMetres: number = SIGNIFICANT_MOVE_METRES,
): boolean {
  if (!current || current.isFallback) return true;
  const d = distanceMetres(current, next);
  if (d < thresholdMetres) return false;
  const accuracy = next.accuracy;
  if (typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0)
    return d >= accuracy * 2;
  return true;
}

/**
 * The coordinates a device fix should move the area to, or null when
 * nothing should change: the area is chosen, or the fix is not a
 * significant move. The label is resolved by the caller (reverse geocoding)
 * only when this returns a value, so no geocode request is spent on a fix
 * that changes nothing.
 */
export function followedAreaAfterFix(
  area: BrowsingArea | null,
  fix: PositionFix,
  thresholdMetres: number = SIGNIFICANT_MOVE_METRES,
): LatLng | null {
  if (area && area.mode === "chosen") return null;
  if (!isSignificantMove(area, fix, thresholdMetres)) return null;
  return { lat: fix.lat, lng: fix.lng };
}

/**
 * Whether to suggest switching from a chosen area to the phone's position:
 * the phone is far from the chosen area (following would show somewhere
 * else) and far from where it was when the person chose, or last dismissed
 * the suggestion (so they have moved on since they last decided).
 */
export function shouldSuggestCurrentLocation(
  state: LocationState | null,
  device: LatLng | null,
  thresholdMetres: number = AREA_MISMATCH_METRES,
): boolean {
  if (!state || !device) return false;
  if (state.area.mode !== "chosen") return false;
  if (distanceMetres(device, state.area) < thresholdMetres) return false;
  if (state.anchor && distanceMetres(device, state.anchor) < thresholdMetres)
    return false;
  return true;
}

/** How the area relates to the phone, for the location switcher's wording. */
export type AreaStatus =
  /** The area follows the phone and is a real position. */
  | "near_you"
  /** The person chose this area; the phone may be elsewhere. */
  | "chosen"
  /** The area would follow the phone, but location is not allowed. */
  | "location_off"
  /** Location is allowed but no position could be had (yet). */
  | "locating";

/**
 * Whether the app can read the phone's position: not yet asked, allowed,
 * refused (can ask again), refused for good (only Settings can change it),
 * or allowed but the phone's location services are switched off.
 */
export type PermissionState =
  | "unknown"
  | "granted"
  | "denied"
  | "blocked"
  | "off";

export function areaStatus(
  area: BrowsingArea | null,
  permission: PermissionState,
): AreaStatus {
  if (area?.mode === "chosen") return "chosen";
  if (
    permission === "denied" ||
    permission === "blocked" ||
    permission === "off"
  )
    return "location_off";
  if (!area || area.isFallback) return "locating";
  return "near_you";
}

function readLatLng(r: Record<string, unknown>): LatLng | null {
  if (typeof r.lat !== "number" || !Number.isFinite(r.lat)) return null;
  if (typeof r.lng !== "number" || !Number.isFinite(r.lng)) return null;
  if (r.lat < -90 || r.lat > 90 || r.lng < -180 || r.lng > 180) return null;
  return { lat: r.lat, lng: r.lng };
}

function readArea(raw: unknown): BrowsingArea | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const point = readLatLng(r);
  if (!point) return null;
  if (typeof r.label !== "string" || !r.label) return null;
  // `source` is the previous record shape (device | manual).
  const mode: AreaMode | null =
    r.mode === "following" || r.source === "device"
      ? "following"
      : r.mode === "chosen" || r.source === "manual"
        ? "chosen"
        : null;
  if (!mode) return null;
  // A fallback is never stored; anything read back is a real position.
  return { ...point, label: r.label, mode, isFallback: false };
}

/**
 * Validates a stored record read back from disk. Anything malformed is
 * dropped (null) so a bad file can never seed the app with NaN coordinates.
 * Accepts the current shape (`{ area, anchor }`) and the previous flat one
 * (`{ lat, lng, label, source }`), so an area chosen before the upgrade is
 * kept rather than asked for again.
 */
export function parseStoredLocationState(raw: unknown): LocationState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if ("area" in r) {
    const area = readArea(r.area);
    if (!area) return null;
    const anchor =
      r.anchor && typeof r.anchor === "object"
        ? readLatLng(r.anchor as Record<string, unknown>)
        : null;
    return { area, anchor };
  }
  const area = readArea(r);
  return area ? { area, anchor: null } : null;
}
