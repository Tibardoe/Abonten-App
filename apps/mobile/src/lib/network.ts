import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

// Wires the device's real connectivity into TanStack Query's onlineManager
// (RN has no `navigator.onLine`, so without this every query thinks it's
// always online and offline failures just look like generic errors). With
// this in place: queries still attempt once when offline (networkMode
// "offlineFirst" in queryClient.ts) so screens hit their own error+retry
// state instead of an infinite spinner, and everything auto-refetches the
// moment the connection returns.
//
// "Offline" is DEBOUNCED; "online" is immediate. NetInfo re-probes
// reachability every time the app comes back from the background, and on
// iOS the interval between "connected" and "reachable" being re-confirmed
// routinely reports `isInternetReachable: false` for a few hundred
// milliseconds. Passing that straight through flashed the red "You're
// offline" bar, then "Back online", on every return to the app, and made
// React Query refetch everything on the fake reconnect. A connection that
// is genuinely gone is still gone after the grace period, so the only cost
// of waiting is that a real drop is announced ~1.5s later.

const OFFLINE_GRACE_MS = 1500;

let started = false;
let offlineTimer: ReturnType<typeof setTimeout> | null = null;
let offlineSince: number | null = null;

function isOnline(state: NetInfoState): boolean {
  // `isInternetReachable` is null until the first probe resolves — treat
  // "connected but not-yet-probed" as online so a cold start isn't
  // wrongly flagged offline.
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function startNetworkSync(): void {
  if (started) return;
  started = true;
  onlineManager.setEventListener((setOnline) => {
    const apply = (state: NetInfoState) => {
      if (isOnline(state)) {
        if (offlineTimer) clearTimeout(offlineTimer);
        offlineTimer = null;
        offlineSince = null;
        setOnline(true);
        return;
      }
      if (offlineTimer) return;
      offlineTimer = setTimeout(() => {
        offlineTimer = null;
        offlineSince = Date.now();
        setOnline(false);
      }, OFFLINE_GRACE_MS);
    };
    const unsub = NetInfo.addEventListener(apply);
    // Coming back to the foreground: ask for a fresh reading straight away
    // rather than waiting for NetInfo's own event, so a stale "offline"
    // clears as soon as the radio is actually back.
    const appState = AppState.addEventListener("change", (s) => {
      if (s === "active")
        NetInfo.fetch()
          .then(apply)
          .catch(() => {});
    });
    return () => {
      unsub();
      appState.remove();
      if (offlineTimer) clearTimeout(offlineTimer);
      offlineTimer = null;
    };
  });
}

/** Reactive "is the device online right now" for UI (the offline banner). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/** When the current offline spell began (ms since epoch), or null. */
export function offlineStartedAt(): number | null {
  return offlineSince;
}

/**
 * True when the current connection is metered (mobile data, a hotspot) —
 * speculative downloads (prefetching screens the person may never open)
 * are skipped then. Unknown counts as metered.
 */
export async function isConnectionExpensive(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.details?.isConnectionExpensive !== false;
  } catch {
    return true;
  }
}
