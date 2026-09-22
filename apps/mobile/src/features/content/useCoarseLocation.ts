import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useEffect, useMemo, useState } from "react";

// A rough position for sponsored placement on the For you / Trending tabs,
// used only when the person has ALREADY allowed location for the app: this
// never shows a permission prompt. It is about where the person physically
// is (so a promotion aimed at an area reaches people there), not the area
// they are browsing, so it reads the phone's position the app already
// follows (ExploreLocationProvider) — rounded to about a kilometre and
// sent with the feed request only; it is not stored.
//
// Resolves quickly so the feed never waits long for it: at once when
// location is not allowed, when the position arrives, or after a short
// grace period if the first fix is slow.

const GRACE_MS = 1500;

const round = (n: number) => Math.round(n * 100) / 100;

export function useCoarseLocation(enabled: boolean): {
  coords: { lat: number; lng: number } | null;
  done: boolean;
} {
  const { devicePosition, devicePermission } = useExploreLocation();
  const [graceOver, setGraceOver] = useState(false);

  const coords = useMemo(
    () =>
      devicePosition
        ? { lat: round(devicePosition.lat), lng: round(devicePosition.lng) }
        : null,
    [devicePosition],
  );

  useEffect(() => {
    if (!enabled || devicePosition || graceOver) return;
    const timeout = setTimeout(() => setGraceOver(true), GRACE_MS);
    return () => clearTimeout(timeout);
  }, [enabled, devicePosition, graceOver]);

  if (!enabled) return { coords: null, done: true };
  if (coords) return { coords, done: true };
  const notAllowed =
    devicePermission === "denied" || devicePermission === "blocked";
  return { coords: null, done: notAllowed || graceOver };
}
