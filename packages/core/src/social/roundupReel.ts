// The vertical video of a roundup (Admin › Social, "Make video (Reel /
// TikTok)"; docs/architecture/social-distribution.md §4.1): the roundup's
// cover, then each listed event's 9:16 Story picture, each held a few
// seconds with a short crossfade into the next, at most 30 seconds, no
// sound. The console draws it on a canvas and records it in the browser;
// this module is only the timing and the file format, so it can be tested.

/** Instagram Reels and TikTok: 9:16, full HD. */
export const REEL_SIZE = { width: 1080, height: 1920 } as const;
export const REEL_FPS = 30;
/** How long the cover stays. */
export const REEL_COVER_MS = 3000;
/** How long each event's picture stays. */
export const REEL_SLIDE_MS = 2500;
/** The crossfade, taken from the end of the slide before. */
export const REEL_FADE_MS = 400;
/** Longest video: a Reel that ends before the viewer scrolls on. */
export const REEL_MAX_MS = 30_000;

export type ReelTimeline = {
  /** When each slide starts, in ms from the beginning. */
  starts: number[];
  durations: number[];
  totalMs: number;
};

/**
 * The timing of a video of `slides` pictures (the cover first). Events
 * share what is left of 30 seconds after the cover when 2.5 s each would
 * run over.
 */
export function reelTimeline(slides: number): ReelTimeline {
  const count = Math.max(0, Math.floor(slides));
  if (count === 0) return { starts: [], durations: [], totalMs: 0 };
  const events = count - 1;
  const perEvent =
    events > 0
      ? Math.min(
          REEL_SLIDE_MS,
          Math.floor((REEL_MAX_MS - REEL_COVER_MS) / events),
        )
      : 0;
  const durations = [REEL_COVER_MS, ...Array(events).fill(perEvent)];
  const starts: number[] = [];
  let at = 0;
  for (const d of durations) {
    starts.push(at);
    at += d;
  }
  return { starts, durations, totalMs: at };
}

/**
 * What shows at `ms`: slide `index`, and the next one over it at opacity
 * `mix` (0 outside a crossfade). Past the end, the last slide.
 */
export function reelFrameAt(
  timeline: ReelTimeline,
  ms: number,
): { index: number; next: number | null; mix: number } {
  const last = timeline.starts.length - 1;
  if (last < 0) return { index: 0, next: null, mix: 0 };
  let index = last;
  for (let i = 0; i <= last; i++) {
    if (ms < timeline.starts[i] + timeline.durations[i]) {
      index = i;
      break;
    }
  }
  const end = timeline.starts[index] + timeline.durations[index];
  const fade = Math.min(REEL_FADE_MS, timeline.durations[index] / 2);
  if (index < last && ms > end - fade) {
    return {
      index,
      next: index + 1,
      mix: Math.min(1, Math.max(0, (ms - (end - fade)) / fade)),
    };
  }
  return { index, next: null, mix: 0 };
}

/**
 * Recording formats, best first: MP4 (H.264), which Instagram takes, then
 * WebM, which it does not. The first one the browser's MediaRecorder
 * supports is used.
 */
export const REEL_MIME_TYPES = [
  "video/mp4;codecs=avc1.640028",
  "video/mp4;codecs=avc1.42E01E",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

export function reelFileExtension(mimeType: string): "mp4" | "webm" {
  return mimeType.toLowerCase().startsWith("video/mp4") ? "mp4" : "webm";
}
