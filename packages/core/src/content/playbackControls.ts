// Rules for the Spotlight player's controls — speed, press-and-hold, the
// scrub timeline — kept free of React and native players so they can be
// tested. The app's player (apps/mobile SpotlightCard / SpotlightTimeline)
// applies them.

/** The speeds offered in the options sheet, slowest first. */
export const SPOTLIGHT_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type SpotlightSpeed = (typeof SPOTLIGHT_SPEEDS)[number];

export const DEFAULT_SPOTLIGHT_SPEED: SpotlightSpeed = 1;

/** Press-and-hold plays at this speed until the finger lifts. */
export const HOLD_SPEED = 2;

/**
 * The rate while a finger is held on the video. Holding is a temporary
 * boost on top of the speed the person chose: it never slows a video that
 * is already set faster than the boost.
 */
export function holdRate(selected: number): number {
  return Math.max(selected, HOLD_SPEED);
}

/** "0.5×", "1×", "1.25×" — the label for a speed. */
export function formatSpeed(rate: number): string {
  return `${Number(rate.toFixed(2))}×`;
}

/** "0:07", "1:05" — a playback position. Negative or unknown reads 0:00. */
export function formatPlaybackTime(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Where a scrub gesture points: the fraction of the track under the finger,
 * clamped, turned into a time. Clips shorter than half a second, or whose
 * length isn't known yet, can't be scrubbed (null).
 */
export function scrubTarget(
  x: number,
  trackWidth: number,
  duration: number,
): number | null {
  // Runs inside the scrub gesture on the UI thread (Reanimated worklet);
  // the directive is an inert string anywhere else.
  "worklet";
  if (!(duration >= 0.5) || !(trackWidth > 0)) return null;
  const fraction = Math.min(1, Math.max(0, x / trackWidth));
  // Never seek onto the very last frame: a looping player wraps to 0:00
  // there, which reads as the scrub jumping back to the start.
  return Math.min(duration - 0.05, fraction * duration);
}
