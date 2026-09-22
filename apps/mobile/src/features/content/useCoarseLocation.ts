import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";

// A rough position for sponsored placement on the For you / Trending tabs,
// used only when the person has ALREADY allowed location for the app: this
// never shows a permission prompt. Rounded to about a kilometre and sent
// with the feed request only; it is not stored. Resolves to null quickly
// when there is no permission or no recent fix, so the feed never waits
// long for it.
//
// The position the app already follows (ExploreLocationProvider) is used
// when it has one — it is the same phone, and it moves with the person —
// so this only asks the OS itself before that first fix has arrived.

const MAX_AGE_MS = 60 * 60 * 1000;

const round = (n: number) => Math.round(n * 100) / 100;

export function useCoarseLocation(enabled: boolean): {
  coords: { lat: number; lng: number } | null;
  done: boolean;
} {
  const { devicePosition } = useExploreLocation();
  const [state, setState] = useState<{
    coords: { lat: number; lng: number } | null;
    done: boolean;
  }>({ coords: null, done: !enabled });

  const followed = useMemo(
    () =>
      devicePosition
        ? { lat: round(devicePosition.lat), lng: round(devicePosition.lng) }
        : null,
    [devicePosition],
  );

  useEffect(() => {
    if (!enabled || devicePosition) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled)
        setState((s) => (s.done ? s : { coords: null, done: true }));
    }, 1500);
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") throw new Error("no permission");
        const last = await Location.getLastKnownPositionAsync({
          maxAge: MAX_AGE_MS,
        });
        if (!last) throw new Error("no fix");
        if (!cancelled) {
          setState({
            coords: {
              lat: round(last.coords.latitude),
              lng: round(last.coords.longitude),
            },
            done: true,
          });
        }
      } catch {
        if (!cancelled) setState({ coords: null, done: true });
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [enabled, devicePosition]);

  if (!enabled) return { coords: null, done: true };
  if (followed) return { coords: followed, done: true };
  return state;
}
