import { useEffect, useState } from "react";
import { FALLBACK_COORDS, useExploreLocation } from "./ExploreLocationProvider";

export { FALLBACK_COORDS };

export type DeviceLocation = {
  lat: number;
  lng: number;
  /** true when these are the Accra fallback, not the real device position. */
  isFallback: boolean;
};

// The phone's position for a screen that shows device-relative content
// (Places near you, Spotlight's Nearby feed). Reads the one position the
// ExploreLocationProvider follows — so every such screen agrees with Explore
// and each other, and moves with the person while it is open — rather than
// each screen asking the OS for its own fix. Asks for permission the first
// time a screen needs it, exactly as before. Resolves to the Accra fallback
// when location is not allowed or no fix could be had.
export function useDeviceLocation(): {
  location: DeviceLocation | null;
  loading: boolean;
} {
  const { devicePosition, ensureDevicePosition, retainDeviceWatch } =
    useExploreLocation();
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const release = retainDeviceWatch();
    let cancelled = false;
    ensureDevicePosition().finally(() => {
      if (!cancelled) setAttempted(true);
    });
    return () => {
      cancelled = true;
      release();
    };
  }, [ensureDevicePosition, retainDeviceWatch]);

  if (devicePosition) return { location: devicePosition, loading: false };
  if (attempted) {
    return {
      location: { ...FALLBACK_COORDS, isFallback: true },
      loading: false,
    };
  }
  return { location: null, loading: true };
}
