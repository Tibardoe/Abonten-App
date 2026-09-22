import { useAppActive } from "@/lib/useAppActive";
import {
  type BrowsingArea,
  type LatLng,
  type LocationState,
  type PermissionState,
  type PositionFix,
  followedAreaAfterFix,
  isSignificantMove,
  parseStoredLocationState,
  shouldSuggestCurrentLocation,
} from "@abonten/core/location/browsingArea";
import { onlineManager } from "@tanstack/react-query";
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

// The app's one source of truth for "where is Abonten showing me things".
// The model — a browsing AREA that follows the phone until the person
// chooses a place, plus a "you're now in…" suggestion when a chosen area
// has been left behind — is in @abonten/core/location/browsingArea, with
// the tests. This file supplies what the model cannot: the position
// stream, permission, reverse geocoding, storage and React state.
//
//   * `area` — what every location-dependent screen shows: Explore, search,
//     Abonten Weekly, Places, Spotlight › Nearby. One area for the whole
//     app, so no screen ever disagrees with another about "here".
//   * `devicePosition` — where the phone is, moved only on a significant
//     change. Used for things that are about physical presence, not
//     browsing (the rough position sent with the sponsored feed), and to
//     notice that a chosen area has been left behind.
//
// Following: one foreground position watcher runs whenever the app is in
// front and location is allowed — nothing runs in the background. Every
// report goes through the same rule: a following area moves only past
// SIGNIFICANT_MOVE_METRES, a chosen area never moves. Coming back to the
// app restarts the watcher with the OS's newest position, so arriving in
// another town updates without waiting for the next report. Permission is
// asked for on the first run and when the person taps "Use my current
// location", never anywhere else; it is re-read (without asking) every time
// the app returns to the foreground, so granting it in Settings takes
// effect on the next return.
//
// Every location-keyed query re-keys from `area` / `devicePosition`, so a
// change refetches exactly the screens that depend on it and nothing keeps
// showing the previous area's results under the new label.

export type { BrowsingArea } from "@abonten/core/location/browsingArea";

export type DevicePosition = LatLng;

export type DevicePermission = PermissionState;

/** Why "Use my current location" could not follow the phone. */
export type FollowOutcome = "ok" | "denied" | "blocked" | "unavailable";

/** Why a typed address could not become the area. */
export type ChooseOutcome = "ok" | "not_found" | "offline";

/** The phone is somewhere else than the chosen area. */
export type AreaSuggestion = {
  /** The town the phone is in, or null when it could not be named. */
  label: string | null;
};

type Ctx = {
  area: BrowsingArea | null;
  /** true while the first value (stored, GPS or the fallback) is resolving. */
  resolving: boolean;
  /** The phone's position, moved only on a significant change. */
  devicePosition: DevicePosition | null;
  /** Foreground location permission as last observed (never prompts). */
  devicePermission: DevicePermission;
  /**
   * Set while the area is chosen and the phone has moved on to somewhere
   * else since the person chose it (or last dismissed this).
   */
  suggestion: AreaSuggestion | null;
  /** Put the suggestion away for as long as the phone stays around here. */
  dismissSuggestion: () => void;
  /** Hand the area to the phone: a fresh fix now, then following. */
  followDevice: () => Promise<FollowOutcome>;
  /** Forward-geocode a typed address and make it the chosen area. */
  chooseTypedArea: (text: string) => Promise<ChooseOutcome>;
  /** Make an exact point (map picker / autocomplete) the chosen area. */
  chooseArea: (lat: number, lng: number, label?: string) => Promise<void>;
};

// Accra city centre — the fallback when location permission is denied or
// unavailable, so discovery still shows something reasonable.
export const FALLBACK_COORDS = { lat: 5.6037, lng: -0.187 } as const;
const FALLBACK_AREA: BrowsingArea = {
  label: "Accra",
  lat: FALLBACK_COORDS.lat,
  lng: FALLBACK_COORDS.lng,
  mode: "following",
  isFallback: true,
};
/** The label of a following area whose town could not be named. */
export const UNNAMED_AREA_LABEL = "Your location";
const UNNAMED_CHOICE_LABEL = "Selected location";

// v3: `{ area, anchor }`. v2 (`{ …, source }`) is read once and migrated so
// an area chosen before the upgrade is kept; v1 is deleted — it could have
// been a "use my current location" that must not come back as a choice.
const STORAGE_KEY = "abonten.browsing-area.v3";
const LEGACY_KEYS = ["abonten.explore-location.v2", "abonten.explore-location"];
// A cold GPS fix indoors, or a device with location services in a bad
// state, can leave getCurrentPositionAsync pending for a very long time —
// seen at ~40 s on a fresh emulator — and the whole Explore screen sat on
// its skeleton until it resolved. Past this, fall back to Accra (the person
// can still choose an area or tap "Use my current location").
const FIRST_FIX_TIMEOUT_MS = 8000;
const ON_DEMAND_FIX_TIMEOUT_MS = 15_000;
const GEOCODE_TIMEOUT_MS = 5000;
const LAST_KNOWN_MAX_AGE_MS = 15 * 60 * 1000;
// "Use my current location" answers at once from a position this fresh
// rather than waiting for a new fix; the watcher refines it if it moves.
const FRESH_ENOUGH_MS = 2 * 60 * 1000;
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

/** The town for a point, or null when the geocoder cannot name it. */
export async function townForCoords(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const [place] = await withTimeout(
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }),
      GEOCODE_TIMEOUT_MS,
    );
    return (
      place?.city ?? place?.subregion ?? place?.region ?? place?.country ?? null
    );
  } catch {
    return null;
  }
}

/** A label for a point chosen by hand (map picker, place forms). */
export async function labelForCoords(
  lat: number,
  lng: number,
): Promise<string> {
  return (await townForCoords(lat, lng)) ?? UNNAMED_CHOICE_LABEL;
}

function toFix(pos: Location.LocationObject): PositionFix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
}

function toPermission(
  res: Location.PermissionResponse,
  servicesEnabled: boolean,
): DevicePermission {
  if (res.status === Location.PermissionStatus.GRANTED)
    return servicesEnabled ? "granted" : "off";
  if (res.status === Location.PermissionStatus.UNDETERMINED) return "unknown";
  return res.canAskAgain ? "denied" : "blocked";
}

/** Permission plus whether the phone's own location switch is on; never prompts. */
async function readPermission(): Promise<DevicePermission> {
  const [res, servicesEnabled] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.hasServicesEnabledAsync().catch(() => true),
  ]);
  return toPermission(res, servicesEnabled);
}

/** Asks for permission (the OS prompt, if it has not been answered yet). */
async function askPermission(): Promise<DevicePermission> {
  const res = await Location.requestForegroundPermissionsAsync();
  const servicesEnabled = await Location.hasServicesEnabledAsync().catch(
    () => true,
  );
  return toPermission(res, servicesEnabled);
}

async function readStoredState(): Promise<LocationState | null> {
  const raw = await SecureStore.getItemAsync(STORAGE_KEY);
  if (raw) return parseStoredLocationState(JSON.parse(raw));
  // Upgrade path: the previous record, read once, then removed.
  const legacy = await SecureStore.getItemAsync(LEGACY_KEYS[0]);
  for (const key of LEGACY_KEYS)
    SecureStore.deleteItemAsync(key).catch(() => {});
  return legacy ? parseStoredLocationState(JSON.parse(legacy)) : null;
}

export function ExploreLocationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [area, setArea] = useState<BrowsingArea | null>(null);
  const [resolving, setResolving] = useState(true);
  const [devicePosition, setDevicePosition] = useState<DevicePosition | null>(
    null,
  );
  const [devicePermission, setDevicePermission] =
    useState<DevicePermission>("unknown");
  const [suggestion, setSuggestion] = useState<AreaSuggestion | null>(null);
  const appActive = useAppActive();

  // The latest committed values, readable from async work that started
  // earlier (a fix whose label was still resolving when the person chose
  // a place must not land on top of that choice).
  const stateRef = useRef<LocationState | null>(null);
  const deviceRef = useRef<DevicePosition | null>(null);
  // The device position the current suggestion was worked out for, so a
  // report that changes nothing never geocodes again.
  const suggestedForRef = useRef<DevicePosition | null>(null);
  // Every intent (a choice, "use my location", a device fix) takes a new
  // number; async work commits only if it is still the newest.
  const intentSeq = useRef(0);

  const persist = useCallback((state: LocationState) => {
    // The fallback is never stored: the next start should try the phone.
    if (state.area.isFallback) return;
    SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state)).catch(
      () => {},
    );
  }, []);

  const commit = useCallback(
    (state: LocationState) => {
      stateRef.current = state;
      setArea(state.area);
      setResolving(false);
      persist(state);
    },
    [persist],
  );

  const clearSuggestion = useCallback(() => {
    suggestedForRef.current = null;
    setSuggestion(null);
  }, []);

  /** Records the phone's position; moves only on a significant change. */
  const commitDevicePosition = useCallback((fix: PositionFix) => {
    if (!isSignificantMove(deviceRef.current, fix)) return;
    const next: DevicePosition = { lat: fix.lat, lng: fix.lng };
    deviceRef.current = next;
    setDevicePosition(next);
  }, []);

  /**
   * One device fix, from any source (boot, watcher, resume, on demand).
   * Updates the device position; moves a following area through the
   * significance rule; for a chosen area, works out whether to suggest
   * switching. `force` makes the fix the area regardless of distance:
   * "Use my current location" must take effect even from a choice a few
   * streets away.
   */
  const applyFix = useCallback(
    async (fix: PositionFix, force = false) => {
      commitDevicePosition(fix);
      const current = stateRef.current;
      const next = force
        ? { lat: fix.lat, lng: fix.lng }
        : followedAreaAfterFix(current?.area ?? null, fix);

      if (next) {
        const seq = ++intentSeq.current;
        const label =
          (await townForCoords(next.lat, next.lng)) ?? UNNAMED_AREA_LABEL;
        if (seq !== intentSeq.current) return;
        // Re-checked after the await: a choice may have landed meanwhile.
        if (
          !force &&
          !followedAreaAfterFix(stateRef.current?.area ?? null, fix)
        )
          return;
        clearSuggestion();
        commit({
          area: { ...next, label, mode: "following", isFallback: false },
          anchor: null,
        });
        return;
      }

      // A chosen area: has the phone moved on to somewhere else?
      const device = deviceRef.current;
      if (!shouldSuggestCurrentLocation(current, device)) {
        if (suggestedForRef.current) clearSuggestion();
        return;
      }
      if (!device || suggestedForRef.current === device) return;
      suggestedForRef.current = device;
      const label = await townForCoords(device.lat, device.lng);
      // Still the same place, and still worth suggesting?
      if (suggestedForRef.current !== device) return;
      if (!shouldSuggestCurrentLocation(stateRef.current, device)) {
        clearSuggestion();
        return;
      }
      setSuggestion({ label });
    },
    [commit, commitDevicePosition, clearSuggestion],
  );

  // First value. A stored area is shown at once (where the person last
  // was, or what they chose); the watcher below then refreshes a
  // following one from the phone. Nothing stored: ask for permission, open
  // on the OS's last known position (instant) and refine with a fresh fix;
  // denied or failed → Accra.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await readStoredState().catch(() => null);
        if (cancelled) return;

        if (stored) {
          stateRef.current = stored;
          setArea(stored.area);
          setResolving(false);
          // Learn the permission state without asking. If it has been
          // revoked since, the area stays where it was and the switcher
          // says location is off; the watcher simply does not run.
          const permission = await readPermission();
          if (!cancelled) setDevicePermission(permission);
          return;
        }

        const permission = await askPermission();
        if (cancelled) return;
        setDevicePermission(permission);
        if (permission !== "granted") {
          commit({ area: FALLBACK_AREA, anchor: null });
          return;
        }

        const last = await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
        }).catch(() => null);
        if (last && !cancelled) await applyFix(toFix(last));

        const pos = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          FIRST_FIX_TIMEOUT_MS,
        );
        if (!cancelled) await applyFix(toFix(pos));
      } catch {
        // Keep a last-known position already shown; only fall back to Accra
        // when nothing at all could be read.
        if (!cancelled && !stateRef.current)
          commit({ area: FALLBACK_AREA, anchor: null });
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyFix, commit]);

  // Permission is external state: re-read it (never asking) each time the
  // app comes to the front, so a change made in Settings takes effect.
  useEffect(() => {
    if (!appActive) return;
    let cancelled = false;
    readPermission()
      .then((permission) => {
        if (!cancelled) setDevicePermission(permission);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appActive]);

  // Follow the phone. Runs while the app is in front and location is
  // allowed. Stopped in the background (no work, no battery), restarted on
  // return — and the restart takes the OS's newest position immediately,
  // so coming back to the app in another town updates without waiting for
  // the next report. It runs for a chosen area too: that is how the app
  // notices the person has moved on and can offer their current location.
  const watchWanted = appActive && devicePermission === "granted";

  useEffect(() => {
    if (!watchWanted) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const last = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
      }).catch(() => null);
      if (cancelled) return;
      if (last) void applyFix(toFix(last));
      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: WATCH_DISTANCE_METRES,
            timeInterval: WATCH_TIME_MS,
          },
          (pos) => {
            if (!cancelled) void applyFix(toFix(pos));
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

  const dismissSuggestion = useCallback(() => {
    const current = stateRef.current;
    clearSuggestion();
    if (!current || current.area.mode !== "chosen") return;
    // Anchored to where the phone is now: the suggestion returns only
    // after the phone has moved on again.
    commit({ area: current.area, anchor: deviceRef.current });
  }, [commit, clearSuggestion]);

  const chooseArea = useCallback(
    async (lat: number, lng: number, label?: string) => {
      const seq = ++intentSeq.current;
      const finalLabel = label?.trim() || (await labelForCoords(lat, lng));
      if (seq !== intentSeq.current) return;
      clearSuggestion();
      commit({
        area: {
          label: finalLabel,
          lat,
          lng,
          mode: "chosen",
          isFallback: false,
        },
        anchor: deviceRef.current,
      });
    },
    [commit, clearSuggestion],
  );

  const chooseTypedArea = useCallback(
    async (text: string): Promise<ChooseOutcome> => {
      const query = text.trim();
      if (!query) return "not_found";
      if (!onlineManager.isOnline()) return "offline";
      const seq = ++intentSeq.current;
      try {
        const [hit] = await Location.geocodeAsync(query);
        if (!hit) return "not_found";
        const town = await townForCoords(hit.latitude, hit.longitude);
        if (seq !== intentSeq.current) return "ok";
        clearSuggestion();
        commit({
          area: {
            label: town ?? query,
            lat: hit.latitude,
            lng: hit.longitude,
            mode: "chosen",
            isFallback: false,
          },
          anchor: deviceRef.current,
        });
        return "ok";
      } catch {
        return onlineManager.isOnline() ? "not_found" : "offline";
      }
    },
    [commit, clearSuggestion],
  );

  const followDevice = useCallback(async (): Promise<FollowOutcome> => {
    const permission = await askPermission();
    setDevicePermission(permission);
    if (permission === "blocked") return "blocked";
    if (permission === "off") return "unavailable";
    if (permission !== "granted") return "denied";
    // A position from the last couple of minutes is the current location:
    // answer with it now instead of making the person wait for a new fix
    // (indoors that can take the whole timeout). The watcher is running and
    // moves the area if the next report is significantly elsewhere.
    const recent = await Location.getLastKnownPositionAsync({
      maxAge: FRESH_ENOUGH_MS,
    }).catch(() => null);
    if (recent) {
      await applyFix(toFix(recent), true);
      return "ok";
    }
    try {
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        ON_DEMAND_FIX_TIMEOUT_MS,
      );
      await applyFix(toFix(pos), true);
      return "ok";
    } catch {
      // The OS's newest position is better than nothing when a fresh fix
      // cannot be had in time (indoors, location services off).
      const last = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
      }).catch(() => null);
      if (!last) return "unavailable";
      await applyFix(toFix(last), true);
      return "ok";
    }
  }, [applyFix]);

  const value = useMemo<Ctx>(
    () => ({
      area,
      resolving,
      devicePosition,
      devicePermission,
      suggestion,
      dismissSuggestion,
      followDevice,
      chooseTypedArea,
      chooseArea,
    }),
    [
      area,
      resolving,
      devicePosition,
      devicePermission,
      suggestion,
      dismissSuggestion,
      followDevice,
      chooseTypedArea,
      chooseArea,
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
