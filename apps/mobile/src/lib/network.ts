import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

// Wires the device's real connectivity into TanStack Query's onlineManager
// (RN has no `navigator.onLine`, so without this every query thinks it's
// always online and offline failures just look like generic errors). With
// this in place: queries still attempt once when offline (networkMode
// "offlineFirst" in queryClient.ts) so screens hit their own error+retry
// state instead of an infinite spinner, and everything auto-refetches the
// moment the connection returns.

let started = false;

export function startNetworkSync(): void {
  if (started) return;
  started = true;
  onlineManager.setEventListener((setOnline) => {
    const unsub = NetInfo.addEventListener((state) => {
      // `isInternetReachable` is null until the first probe resolves — treat
      // "connected but not-yet-probed" as online so a cold start isn't
      // wrongly flagged offline.
      const online =
        state.isConnected === true && state.isInternetReachable !== false;
      setOnline(online);
    });
    return unsub;
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
