import {
  DEFAULT_SPOTLIGHT_SPEED,
  type SpotlightSpeed,
} from "@abonten/core/content/playbackControls";
import { useSyncExternalStore } from "react";

// The playback speed chosen in a Spotlight's options sheet. One value for
// the whole app, like the sound preference (spotlightSound.ts): choosing
// 1.5× applies to the next video too, and to a post opened from a profile.
// Unlike sound it lasts for this session only — a slowed or sped-up feed
// the next morning would read as something being wrong. Press-and-hold is
// a separate, temporary boost the card applies on top (holdRate); it never
// changes this value.

let speed: SpotlightSpeed = DEFAULT_SPOTLIGHT_SPEED;
const listeners = new Set<() => void>();

export function getSpotlightSpeed(): SpotlightSpeed {
  return speed;
}

export function setSpotlightSpeed(next: SpotlightSpeed): void {
  if (next === speed) return;
  speed = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSpotlightSpeed(): SpotlightSpeed {
  return useSyncExternalStore(subscribe, getSpotlightSpeed, getSpotlightSpeed);
}
