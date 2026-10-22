// Which event a Safety session is about: the one the person holds a ticket
// for that is on now, else the next one today, else one that just ended
// (people leave venues after the end time). The server answers this for the
// Safety screen so the app and the website pick the same one.

import type { Occurrence } from "@abonten/types/occurrenceType";

export type SafetyEventCandidate = {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  occurrences?: Occurrence[] | null;
};

export type SafetyEventTiming = "ongoing" | "upcoming" | "ended";

/** Upcoming within this window counts; later events are not offered. */
export const CONTEXT_UPCOMING_MS = 12 * 60 * 60_000;
/** Ended within this window still counts (the walk home). */
export const CONTEXT_ENDED_MS = 6 * 60 * 60_000;

function windows(c: SafetyEventCandidate): { start: number; end: number }[] {
  const source =
    c.occurrences && c.occurrences.length > 0
      ? c.occurrences.map((o) => ({ s: o.starts_at, e: o.ends_at }))
      : c.startsAt
        ? [{ s: c.startsAt, e: c.endsAt ?? c.startsAt }]
        : [];
  return source
    .map((w) => ({
      start: Date.parse(String(w.s)),
      end: Date.parse(String(w.e)),
    }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
}

/** How an event stands for Safety right now, or null when it is not relevant. */
export function safetyEventTiming(
  c: SafetyEventCandidate,
  now: number,
): { timing: SafetyEventTiming; distance: number } | null {
  let best: { timing: SafetyEventTiming; distance: number } | null = null;
  const rank = { ongoing: 0, upcoming: 1, ended: 2 } as const;
  for (const w of windows(c)) {
    let entry: { timing: SafetyEventTiming; distance: number } | null = null;
    if (now >= w.start && now <= Math.max(w.end, w.start)) {
      entry = { timing: "ongoing", distance: 0 };
    } else if (w.start > now && w.start - now <= CONTEXT_UPCOMING_MS) {
      entry = { timing: "upcoming", distance: w.start - now };
    } else if (w.end < now && now - w.end <= CONTEXT_ENDED_MS) {
      entry = { timing: "ended", distance: now - w.end };
    }
    if (
      entry &&
      (!best ||
        rank[entry.timing] < rank[best.timing] ||
        (rank[entry.timing] === rank[best.timing] &&
          entry.distance < best.distance))
    ) {
      best = entry;
    }
  }
  return best;
}

/** Relevant events, most relevant first. */
export function rankSafetyEvents<T extends SafetyEventCandidate>(
  candidates: readonly T[],
  now: number,
): (T & { timing: SafetyEventTiming })[] {
  const rank = { ongoing: 0, upcoming: 1, ended: 2 } as const;
  return candidates
    .map((c) => ({ c, t: safetyEventTiming(c, now) }))
    .filter(
      (x): x is { c: T; t: { timing: SafetyEventTiming; distance: number } } =>
        x.t !== null,
    )
    .sort(
      (a, b) =>
        rank[a.t.timing] - rank[b.t.timing] || a.t.distance - b.t.distance,
    )
    .map(({ c, t }) => ({ ...c, timing: t.timing }));
}
