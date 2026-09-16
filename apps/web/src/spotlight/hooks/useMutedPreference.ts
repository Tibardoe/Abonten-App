"use client";

import { useSyncExternalStore } from "react";

// One sound switch for every Spotlight and Story player on the page.
// Browsers only allow autoplay with sound after the visitor interacts, so
// playback starts muted until they turn sound on once.

let muted = true;
const listeners = new Set<() => void>();

export function setContentMuted(next: boolean) {
  if (muted === next) return;
  muted = next;
  for (const listener of listeners) listener();
}

export function useMutedPreference(): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => muted,
    () => true,
  );
  return [value, setContentMuted];
}
