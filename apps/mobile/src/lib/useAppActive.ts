import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

// Whether the app is in the foreground right now. One AppState subscription
// per consumer, read through useSyncExternalStore so a component never
// renders with a stale value. "inactive" (iOS app switcher, a system sheet,
// the phone locking) counts as not active: media should stop there too.

function subscribe(onChange: () => void) {
  const sub = AppState.addEventListener("change", onChange);
  return () => sub.remove();
}

function snapshot(): boolean {
  // `unknown` (or null) during start-up is treated as active: the app is
  // being launched in front of the person.
  const state = AppState.currentState;
  return state !== "background" && state !== "inactive";
}

export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
