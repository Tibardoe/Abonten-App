import * as Location from "expo-location";
import { useEffect, useState } from "react";

// Accra city centre — the fallback when location permission is denied or
// unavailable, so discovery still shows something reasonable.
export const FALLBACK_COORDS = { lat: 5.6037, lng: -0.187 } as const;

export type DeviceLocation = {
  lat: number;
  lng: number;
  /** true when these are the Accra fallback, not the real device position. */
  isFallback: boolean;
};

export function useDeviceLocation(): {
  location: DeviceLocation | null;
  loading: boolean;
} {
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!cancelled) setLocation({ ...FALLBACK_COORDS, isFallback: true });
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            isFallback: false,
          });
        }
      } catch {
        if (!cancelled) setLocation({ ...FALLBACK_COORDS, isFallback: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { location, loading };
}
