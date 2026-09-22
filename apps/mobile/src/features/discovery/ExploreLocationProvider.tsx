import { useAppActive } from "@/lib/useAppActive";
import {
  type FollowedLocation,
  type LatLng,
  isSignificantMove,
  nextFollowedLocation,
  parseStoredLocation,
} from "@abonten/core/location/followDevice";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// The app's one source of truth for "where is this person looking".
//
// Two things live here:
//
//   * `location` — the Explore area (the web app carries this in the
//     `/explore/[location]` slug; mobile has no location in the route). It
//     has an owner, `source`: "device" means it follows the phone, "manual"
//     means the person chose it (typed, picked on the map, autocomplete) and
//     the phone never overrides it until they choose again or tap "Use my
//     current location". Persisted per device so a restart opens where the
//     person left off, then refreshed.
//
//   * `devicePosition` — the phone's own position, for screens that need
//     the device rather than the chosen area (Places near you, Spotlight's
//     Nearby feed). Also what `location` is derived from while the device
//     owns it.
//
// Following the phone: while the app is in the foreground, location is
// allowed, and either the device owns the area or a screen has asked for
// the device position, one position watcher runs (a few hundred metres
// between reports). Each report goes through the same rule
// (@abonten/core/location/followDevice): only a move past
// SIGNIFICANT_MOVE_METRES changes anything, so GPS jitter never refetches a
// screen and a walk to the shop does not flip the area, but arriving in
// another town does — automatically, including on return from the
// background. Every location-keyed query re-keys from `location` /
// `devicePosition`, so a change refetches exactly the screens that depend
// on it and nothing keeps showing the previous area's results.

export type ExploreLocation = FollowedLocation;

export type DevicePosition = LatLng & { isFallback: false };

export type DevicePermission = "unknown" | "granted" | "denied";

type Ctx = {
  location: ExploreLocation | null;
  /** true while the first value (stored, GPS or the fallback) is resolving. */
  resolving: boolean;
  /** The phone's position, moved only on a significant change. */
  devicePosition: DevicePosition | null;
  /** Foreground location permission as last observed (never prompts). */
  devicePermission: DevicePermission;
  /**
   * Get the phone's position for a screen that needs it, prompting for
   * permission if it was never asked. Resolves null when not allowed or no
   * fix could be had in time.
   */
  ensureDevicePosition: () => Promise<DevicePosition | null>;
  /**
   * Keep the position watcher running while a screen shows device-relative
   * content, even when the area is a manual choice. Returns the release.
   */
  retainDeviceWatch: () => () => void;
  /** Forward-geocode a typed address and make it the (manual) area. */
  setTypedLocation: (text: string) => Promise<boolean>;
  /** Hand the area back to the phone: a fresh fix now, then following. */
  useCurrentLocation: () => Promise<boolean>;
  /** Commit an exact point (map picker / autocomplete) as the manual area. */
  setPickedLocation: (
    lat: number,
    lng: number,
    label?: string,
  ) => Promise<void>;
};

// Accra city centre — the fallback when location permission is denied or
// unavailable, so discovery still shows something reasonable.
export const FALLBACK_COORDS = { lat: 5.6037, lng: -0.187 } as const;
const FALLBACK_LABEL = "Accra";
const FALLBACK_LOCATION: ExploreLocation = {
  label: FALLBACK_LABEL,
  lat: FALLBACK_COORDS.lat,
  lng: FALLBACK_COORDS.lng,
  isFallback: true,
  source: "device",
};

// v2: the record now carries its owner (`source`). The v1 key is removed on
// first run rather than migrated — a v1 record could have been "use my
// current location", which must not come back as a frozen choice.
const STORAGE_KEY = "abonten.explore-location.v2";
const LEGACY_STORAGE_KEY = "abonten.explore-location";
// A cold GPS fix indoors, or a device with location services in a bad
// state, can leave getCurrentPositionAsync pending for a very long time —
// seen at ~40 s on a fresh emulator — and the whole Explore screen sat on
// its skeleton until it resolved. Past this, fall back to Accra (the person
// can still set a location by hand or tap "Use my current location").
const FIRST_FIX_TIMEOUT_MS = 8000;
const ON_DEMAND_FIX_TIMEOUT_MS = 15_000;
const GEOCODE_TIMEOUT_MS = 5000;
const LAST_KNOWN_MAX_AGE_MS = 15 * 60 * 1000;
// The watcher reports after this much movement; the significance rule then
// decides whether anything changes. iOS ignores timeInterval.
const WATCH_DISTANCE_METRES = 300;
const WATCH_TIME_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("location-timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const ExploreLocationContext = createContext<Ctx | null>(null);

export async function labelForCoords(
  lat: number,
  lng: number,
): Promise<string> {
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

/** A label for a device position, never slower than the geocode timeout. */
function labelForDevice(point: LatLng): Promise<string> {
  return withTimeout(
    labelForCoords(point.lat, point.lng),
    GEOCODE_TIMEOUT_MS,
  ).catch(() => "Near you");
}

function toPoint(pos: Location.LocationObject): LatLng {
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

function toPermission(status: Location.PermissionStatus): DevicePermission {
  return status === "granted" ? "granted" : "denied";
}

export function ExploreLocationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location, setLocation] = useState<ExploreLocation | null>(null);
  const [resolving, setResolving] = useState(true);
  const [devicePosition, setDevicePosition] = useState<DevicePosition | null>(
    null,
  );
  const [devicePermission, setDevicePermission] =
    useState<DevicePermission>("unknown");
  const [watchRetainers, setWatchRetainers] = useState(0);
  const appActive = useAppActive();

  // The latest committed values, readable from async work that started
  // earlier (a fix whose label was still resolving when the person picked
  // a place by hand must not land on top of that pick).
  const locationRef = useRef<ExploreLocation | null>(null);
  const devicePositionRef = useRef<DevicePosition | null>(null);
  // Only the most recent device fix may be committed once its label is in.
  const fixSeq = useRef(0);

  const commit = useCallback((next: ExploreLocation) => {
    locationRef.current = next;
    setLocation(next);
    setResolving(false);
    // The fallback is never stored: the next start should try the phone.
    if (next.isFallback) return;
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const commitDevicePosition = useCallback((point: LatLng) => {
    if (!isSignificantMove(devicePositionRef.current, point)) return;
    const next: DevicePosition = {
      lat: point.lat,
      lng: point.lng,
      isFallback: false,
    };
    devicePositionRef.current = next;
    setDevicePosition(next);
  }, []);

  /**
   * One device fix, from any source (boot, watcher, resume, on demand).
   * Updates the device position and, when the device owns the area, the
   * area — both through the significance rule. `force` commits the area
   * regardless of distance: "Use my current location" must take effect
   * even from a manual choice a few streets away.
   */
  const applyFix = useCallback(
    async (point: LatLng, force = false) => {
      commitDevicePosition(point);
      const next = force
        ? { lat: point.lat, lng: point.lng }
        : nextFollowedLocation(locationRef.current, point);
      if (!next) return;
      const seq = ++fixSeq.current;
      const label = await labelForDevice(next);
      if (seq !== fixSeq.current) return;
      // Re-checked after the await: a manual pick may have landed meanwhile.
      if (!force && !nextFollowedLocation(locationRef.current, point)) return;
      commit({ ...next, label, isFallback: false, source: "device" });
    },
    [commit, commitDevicePosition],
  );

  // First value. A stored record is shown at once (the area the person
  // last had), then — when the device owns it — refreshed from the phone.
  // Nothing stored: ask for permission, open on the OS's last known
  // position (instant), and refine with a fresh fix; denied or failed →
  // Accra.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        SecureStore.deleteItemAsync(LEGACY_STORAGE_KEY).catch(() => {});
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        const stored = raw ? parseStoredLocation(JSON.parse(raw)) : null;
        if (cancelled) return;

        if (stored) {
          locationRef.current = stored;
          setLocation(stored);
          setResolving(false);
          if (stored.source === "manual") {
            // A choice stands. Learn the permission state without asking,
            // so screens that need the phone know whether they can have it.
            const { status } = await Location.getForegroundPermissionsAsync();
            if (!cancelled) setDevicePermission(toPermission(status));
            return;
          }
          // Device-owned: a stale stored position is better than nothing,
          // but only until the phone answers. No prompt here — permission
          // was granted when this was stored; if it has since been revoked
          // the stored area stays and the watcher simply does not run.
          const { status } = await Location.getForegroundPermissionsAsync();
          if (cancelled) return;
          setDevicePermission(toPermission(status));
          if (status !== "granted") return;
          commitDevicePosition({ lat: stored.lat, lng: stored.lng });
          const last = await Location.getLastKnownPositionAsync({
            maxAge: LAST_KNOWN_MAX_AGE_MS,
          }).catch(() => null);
          if (last && !cancelled) await applyFix(toPoint(last));
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setDevicePermission(toPermission(status));
        if (status !== "granted") {
          commit(FALLBACK_LOCATION);
          return;
        }

        const last = await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
        }).catch(() => null);
        if (last && !cancelled) await applyFix(toPoint(last));

        const pos = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          FIRST_FIX_TIMEOUT_MS,
        );
        if (!cancelled) await applyFix(toPoint(pos));
      } catch {
        // Keep a last-known position already shown; only fall back to Accra
        // when nothing at all could be read.
        if (!cancelled && !locationRef.current) commit(FALLBACK_LOCATION);
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFix, commit, commitDevicePosition]);

  // Follow the phone. Runs while the app is in front, location is allowed,
  // and someone needs it: the device owns the area, or a screen holds the
  // watch. Stopped in the background (no work, no battery), restarted on
  // return — and the restart takes the OS's newest position immediately,
  // so coming back to the app in another town updates without waiting for
  // the next report.
  const followArea =
    location === null || location.source === "device" || location.isFallback;
  const watchWanted =
    appActive &&
    devicePermission === "granted" &&
    (followArea || watchRetainers > 0);

  useEffect(() => {
    if (!watchWanted) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const last = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
      }).catch(() => null);
      if (cancelled) return;
      if (last) void applyFix(toPoint(last));
      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: WATCH_DISTANCE_METRES,
            timeInterval: WATCH_TIME_MS,
          },
          (pos) => {
            if (!cancelled) void applyFix(toPoint(pos));
          },
          () => {
            // Provider unavailable (location services switched off): the
            // last position stands; a later start tries again.
          },
        );
        if (cancelled) subscription.remove();
      } catch {
        // Same as the error handler above.
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [watchWanted, applyFix]);

  const retainDeviceWatch = useCallback(() => {
    setWatchRetainers((n) => n + 1);
    return () => setWatchRetainers((n) => Math.max(0, n - 1));
  }, []);

  const ensureDevicePosition = useCallback(async () => {
    if (devicePositionRef.current) return devicePositionRef.current;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setDevicePermission(toPermission(status));
      if (status !== "granted") return null;
      const last = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
      }).catch(() => null);
      const pos =
        last ??
        (await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          ON_DEMAND_FIX_TIMEOUT_MS,
        ));
      await applyFix(toPoint(pos));
      return devicePositionRef.current;
    } catch {
      return null;
    }
  }, [applyFix]);

  const setTypedLocation = useCallback(
    async (text: string) => {
      const query = text.trim();
      if (!query) return false;
      try {
        const [hit] = await Location.geocodeAsync(query);
        if (!hit) return false;
        const label = await labelForCoords(hit.latitude, hit.longitude);
        commit({
          label: label === "Selected location" ? query : label,
          lat: hit.latitude,
          lng: hit.longitude,
          isFallback: false,
          source: "manual",
        });
        return true;
      } catch {
        return false;
      }
    },
    [commit],
  );

  const setPickedLocation = useCallback(
    async (lat: number, lng: number, label?: string) => {
      const finalLabel = label?.trim() || (await labelForCoords(lat, lng));
      commit({
        label: finalLabel,
        lat,
        lng,
        isFallback: false,
        source: "manual",
      });
    },
    [commit],
  );

  const useCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setDevicePermission(toPermission(status));
      if (status !== "granted") return false;
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        ON_DEMAND_FIX_TIMEOUT_MS,
      );
      await applyFix(toPoint(pos), true);
      return true;
    } catch {
      return false;
    }
  }, [applyFix]);

  const value = useMemo<Ctx>(
    () => ({
      location,
      resolving,
      devicePosition,
      devicePermission,
      ensureDevicePosition,
      retainDeviceWatch,
      setTypedLocation,
      useCurrentLocation,
      setPickedLocation,
    }),
    [
      location,
      resolving,
      devicePosition,
      devicePermission,
      ensureDevicePosition,
      retainDeviceWatch,
      setTypedLocation,
      useCurrentLocation,
      setPickedLocation,
    ],
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
