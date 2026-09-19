import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

// Whether Spotlight video plays with sound. ONE app-wide preference, not
// per-screen state: it used to be `useState(true)` inside each screen, so
// turning the sound on, opening a profile and coming back reset it to muted,
// and the feed and a single opened post disagreed.
//
// Muted until the person turns sound on (autoplaying audio in a scrolling
// feed is intrusive); from then on their choice is remembered across screens
// and restarts, until they mute again. Stored in a tiny file in the document
// directory (survives restarts, unlike the cache directory).

const file = new File(Paths.document, "spotlight-sound.json");

function readStored(): boolean {
  try {
    if (!file.exists) return true;
    const parsed = JSON.parse(file.textSync()) as { muted?: unknown };
    return parsed.muted !== false;
  } catch {
    return true;
  }
}

let muted = readStored();
const listeners = new Set<() => void>();

export function getSpotlightMuted(): boolean {
  return muted;
}

export function setSpotlightMuted(next: boolean): void {
  if (next === muted) return;
  muted = next;
  for (const l of listeners) l();
  try {
    file.write(JSON.stringify({ muted: next }));
  } catch {
    // The in-memory value still applies for this session.
  }
}

export function toggleSpotlightMuted(): void {
  setSpotlightMuted(!muted);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSpotlightMuted(): boolean {
  return useSyncExternalStore(subscribe, getSpotlightMuted, getSpotlightMuted);
}
