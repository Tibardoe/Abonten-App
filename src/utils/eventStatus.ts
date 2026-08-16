import type { Occurrence } from "@/types/occurrenceType";

export type EventStatus = "upcoming" | "ongoing" | "ended";

type NormalizedOccurrence = { starts: Date; ends: Date };

/**
 * Builds the list of session windows to evaluate. Multi-date events store
 * their real sessions in `occurrences` (from `event_occurrence`); single-date
 * events have no occurrence rows, so `starts_at`/`ends_at` is treated as the
 * event's one and only session. Invalid dates are dropped rather than left
 * to produce `Invalid Date` comparisons (always false, silently wrong).
 */
function normalizeEventOccurrences(
  starts_at: Date | string | null | undefined,
  ends_at: Date | string | null | undefined,
  occurrences?: Occurrence[] | null,
): NormalizedOccurrence[] {
  const source: { starts_at: Date | string; ends_at: Date | string }[] =
    occurrences && occurrences.length > 0
      ? occurrences
      : starts_at && ends_at
        ? [{ starts_at, ends_at }]
        : [];

  return source
    .map((occ) => ({
      starts: new Date(occ.starts_at),
      ends: new Date(occ.ends_at),
    }))
    .filter(
      (occ) =>
        !Number.isNaN(occ.starts.getTime()) &&
        !Number.isNaN(occ.ends.getTime()),
    );
}

/**
 * Single source of truth for an event's lifecycle status, derived from its
 * complete schedule rather than any one session. A past session must not
 * end the event while a future or ongoing one remains — "ended" only holds
 * once every session's end time is in the past. Returns null when there is
 * no date information at all (neither occurrences nor starts_at/ends_at).
 */
export function getEventStatus(
  starts_at: Date | string | null | undefined,
  ends_at: Date | string | null | undefined,
  occurrences?: Occurrence[] | null,
): EventStatus | null {
  const occs = normalizeEventOccurrences(starts_at, ends_at, occurrences);

  if (occs.length === 0) return null;

  const now = Date.now();

  const isOngoing = occs.some(
    (occ) => now >= occ.starts.getTime() && now <= occ.ends.getTime(),
  );
  if (isOngoing) return "ongoing";

  const hasUpcoming = occs.some((occ) => occ.starts.getTime() > now);
  if (hasUpcoming) return "upcoming";

  return "ended";
}
