// "Remind me before it starts" needs a start still to come. A reminder is
// set against the next date that has not begun: the event's own start, or
// for an event with several dates the next of them. Once every date has
// begun (a single-date event that is on now, the last date of a festival
// under way) there is nothing left to remind anyone of, even while tickets
// are still sold during the session (same-day sales, PROJECT.md §91), so no
// reminder is offered. A postponed event has no date yet: its old one would
// remind people of a day that is no longer happening.

type DateLike = string | Date | null | undefined;

function timeOf(value: DateLike): number | null {
  if (!value) return null;
  const ms = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The start of the next date that has not begun, as given (an ISO string
 * stays the same string, so a stored reminder is not re-armed for nothing),
 * or null when every date has started or the event is postponed. The
 * dates of an event with several are its occurrences; otherwise its own
 * start.
 */
export function nextReminderStart(
  startsAt: DateLike,
  occurrences: readonly { starts_at: DateLike }[] | null | undefined,
  options: { now?: number; postponedAt?: DateLike } = {},
): string | null {
  if (options.postponedAt) return null;
  const now = options.now ?? Date.now();
  const dates =
    occurrences && occurrences.length > 0
      ? occurrences.map((o) => o.starts_at)
      : [startsAt];
  let next: { value: DateLike; ms: number } | null = null;
  for (const value of dates) {
    const ms = timeOf(value);
    if (ms === null || ms <= now) continue;
    if (!next || ms < next.ms) next = { value, ms };
  }
  if (!next?.value) return null;
  return next.value instanceof Date ? next.value.toISOString() : next.value;
}
