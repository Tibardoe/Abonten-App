import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FALLBACK_COORDS } from "./useDeviceLocation";

// The Explore screen's active location. The web app carries this in the URL
// slug (`/explore/[location]`); mobile has no location in the route, so it
// lives here: seeded from the device GPS on first run, overridable through
// the "Set your location" sheet, and persisted per device so the choice
// survives a restart (the native equivalent of the web slug being
// bookmarkable).

export type ExploreLocation = {
  label: string;
  lat: number;
  lng: number;
  /** true when these are the Accra fallback, not a real/chosen position. */
  isFallback: boolean;
};

type Ctx = {
  location: ExploreLocation | null;
  /** true while the first fix (GPS or stored) is still resolving. */
  resolving: boolean;
  /** Forward-geocode a typed address and make it the active location. */
  setTypedLocation: (text: string) => Promise<boolean>;
  /** Re-acquire the device GPS position and make it active. */
  useCurrentLocation: () => Promise<boolean>;
};

const STORAGE_KEY = "abonten.explore-location";
const FALLBACK_LABEL = "Accra";

const ExploreLocationContext = createContext<Ctx | null>(null);

async function labelForCoords(lat: number, lng: number): Promise<string> {
  try {
    const [place] = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });
    return (
      place?.city ??
      place?.subregion ??
      place?.region ??
      place?.country ??
      "Selected location"
    );
  } catch {
    return "Selected location";
  }
}

export function ExploreLocationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location, setLocation] = useState<ExploreLocation | null>(null);
  const [resolving, setResolving] = useState(true);

  const persist = useCallback((next: ExploreLocation) => {
    setLocation(next);
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // First fix: a stored choice wins; otherwise fall back to device GPS,
  // then to Accra (same fallback coords as useDeviceLocation).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored && !cancelled) {
          const parsed = JSON.parse(stored) as ExploreLocation;
          if (
            typeof parsed?.lat === "number" &&
            typeof parsed?.lng === "number"
          ) {
            setLocation(parsed);
            setResolving(false);
            return;
          }
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!cancelled) {
            setLocation({
              label: FALLBACK_LABEL,
              lat: FALLBACK_COORDS.lat,
              lng: FALLBACK_COORDS.lng,
              isFallback: true,
            });
          }
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const label = await labelForCoords(
          pos.coords.latitude,
          pos.coords.longitude,
        );
        if (!cancelled) {
          setLocation({
            label,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            isFallback: false,
          });
        }
      } catch {
        if (!cancelled) {
          setLocation({
            label: FALLBACK_LABEL,
            lat: FALLBACK_COORDS.lat,
            lng: FALLBACK_COORDS.lng,
            isFallback: true,
          });
        }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setTypedLocation = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query) return false;
      try {
        const [hit] = await Location.geocodeAsync(query);
        if (!hit) return false;
        const label = await labelForCoords(hit.latitude, hit.longitude);
        persist({
          label: label === "Selected location" ? query : label,
          lat: hit.latitude,
          lng: hit.longitude,
          isFallback: false,
        });
        return true;
      } catch {
        return false;
      }
    },
    [persist],
  );

  const useCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return false;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const label = await labelForCoords(
        pos.coords.latitude,
        pos.coords.longitude,
      );
      persist({
        label,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        isFallback: false,
      });
      return true;
    } catch {
      return false;
    }
  }, [persist]);

  const value = useMemo<Ctx>(
    () => ({ location, resolving, setTypedLocation, useCurrentLocation }),
    [location, resolving, setTypedLocation, useCurrentLocation],
  );

  return (
    <ExploreLocationContext.Provider value={value}>
      {children}
    </ExploreLocationContext.Provider>
  );
}

export function useExploreLocation(): Ctx {
  const ctx = useContext(ExploreLocationContext);
  if (!ctx) {
    throw new Error(
      "useExploreLocation must be used within an ExploreLocationProvider",
    );
  }
  return ctx;
}
