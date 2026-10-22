import type { SafetyLocationBody } from "@abonten/api-client";
import * as Location from "expo-location";

// Positions for Abonten Safety. An alert never waits for a perfect fix:
// the last known position (if recent) goes at once, a fresh high-accuracy
// one follows. The permission prompt is only ever shown after the person
// asked for something that needs it (SOS, a check-in, a share).

export type SafetyLocationPermission =
  | "granted"
  | "denied"
  | "blocked"
  | "unknown";

const LAST_KNOWN_MAX_AGE_MS = 2 * 60_000;

export async function readSafetyLocationPermission(): Promise<SafetyLocationPermission> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    if (p.granted) return "granted";
    if (p.status === "undetermined") return "unknown";
    return p.canAskAgain ? "denied" : "blocked";
  } catch {
    return "unknown";
  }
}

/** Asks only when it has not been answered for good. */
export async function askSafetyLocationPermission(): Promise<SafetyLocationPermission> {
  const now = await readSafetyLocationPermission();
  if (now === "granted" || now === "blocked") return now;
  try {
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.granted) return "granted";
    return p.canAskAgain ? "denied" : "blocked";
  } catch {
    return "unknown";
  }
}

export function toSafetyPoint(
  pos: Location.LocationObject,
  source: SafetyLocationBody["source"] = "device",
): SafetyLocationBody {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracyM:
      typeof pos.coords.accuracy === "number" && pos.coords.accuracy >= 0
        ? Math.round(pos.coords.accuracy)
        : null,
    at: new Date(pos.timestamp || Date.now()).toISOString(),
    source,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** A fresh, accurate fix, or null within `timeoutMs`. Never prompts. */
export async function freshSafetyFix(
  timeoutMs = 10_000,
): Promise<SafetyLocationBody | null> {
  if ((await readSafetyLocationPermission()) !== "granted") return null;
  try {
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      timeoutMs,
    );
    return pos ? toSafetyPoint(pos) : null;
  } catch {
    return null;
  }
}

/** The last known position when it is recent; never waits for the GPS. */
export async function lastKnownSafetyFix(): Promise<SafetyLocationBody | null> {
  if ((await readSafetyLocationPermission()) !== "granted") return null;
  try {
    const last = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
    });
    return last ? toSafetyPoint(last, "last_known") : null;
  } catch {
    return null;
  }
}

/**
 * The quickest usable position: the last known one when it is recent, else a
 * fresh fix within `timeoutMs`. Never prompts.
 */
export async function quickSafetyFix(
  timeoutMs = 2500,
): Promise<SafetyLocationBody | null> {
  if ((await readSafetyLocationPermission()) !== "granted") return null;
  try {
    const last = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
    });
    if (last) return toSafetyPoint(last, "last_known");
  } catch {
    // fall through to a fresh fix
  }
  return freshSafetyFix(timeoutMs);
}
