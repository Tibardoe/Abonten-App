import type { ContentViewKind } from "@abonten/types/contentType";

// Which telemetry events a play session should report, from what the player
// observed. The database re-validates everything (dedupe, watch-time floor,
// rate limits); this just avoids sending events that could never count.

export const MEANINGFUL_VIEW_MS = 2000;
export const IMAGE_DWELL_MS = 5000;

export type PlaySession = {
  /** Milliseconds actually watched (not counting loading or pauses). */
  watchedMs: number;
  /** Media duration in ms; null for images. */
  durationMs: number | null;
  /** How many times playback wrapped around to the start. */
  loops: number;
  /** The player reached the end at least once. */
  reachedEnd: boolean;
};

export function viewEventsFor(session: PlaySession): ContentViewKind[] {
  const out: ContentViewKind[] = [];
  if (session.watchedMs <= 0) return out;
  out.push("view_start");
  if (session.watchedMs >= MEANINGFUL_VIEW_MS) out.push("meaningful_view");
  const completed =
    session.reachedEnd ||
    (session.durationMs !== null &&
      session.watchedMs >= session.durationMs * 0.95) ||
    (session.durationMs === null && session.watchedMs >= IMAGE_DWELL_MS);
  if (completed) out.push("completion");
  if (session.loops > 0 && completed) out.push("replay");
  return out;
}
