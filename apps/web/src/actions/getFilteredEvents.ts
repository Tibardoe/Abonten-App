import type { UserPostType } from "@/types/postsType";

/**
 * All of an event's session start times — every occurrence's starts_at, or
 * the main starts_at as a single-session fallback. Multi-date events have
 * `starts_at` set to null (see postEvent.ts), so checking only that field
 * silently drops them from every date-window filter below; checking each
 * occurrence is what makes a multi-date event show up in "Happening Today"
 * when ANY of its sessions (not just the first) falls in that window.
 */
function getOccurrenceStarts(event: UserPostType): Date[] {
  const occurrences =
    event.occurrences && event.occurrences.length > 0
      ? event.occurrences
      : (event.event_occurrence ?? []);

  const starts =
    occurrences.length > 0
      ? occurrences.map((occ) => occ.starts_at)
      : event.starts_at
        ? [event.starts_at]
        : [];

  return starts
    .map((s) => new Date(s))
    .filter((d) => !Number.isNaN(d.getTime()));
}

export type EventDateFilter =
  | "happening-today"
  | "happening-this-week"
  | "happening-this-month"
  | "top-rated-organizers"
  | "category"
  | "around-you";

/**
 * Pure, synchronous date-window filter — no fetching. Used for the small,
 * bounded preview sliders on the location page, which reuse one shared
 * "nearby events" fetch across several sliders instead of re-fetching per
 * filter. The dedicated, infinite-scrolled "see all" pages for
 * happening-today/this-week/this-month use `getEventsInWindow` (a real
 * server-side, paginated date-range query) instead of this function.
 */
export function filterEventsByWindow(
  events: UserPostType[],
  filter: EventDateFilter,
): UserPostType[] {
  // Make sure "now" is fresh each time
  const now = new Date();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const oneWeekFromNow = new Date();
  oneWeekFromNow.setDate(now.getDate() + 7);

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  switch (filter) {
    case "happening-today":
      return events.filter((event) =>
        getOccurrenceStarts(event).some(
          (startDate) => startDate >= todayStart && startDate <= todayEnd,
        ),
      );

    case "happening-this-week":
      return events.filter((event) =>
        getOccurrenceStarts(event).some(
          (startDate) => startDate >= now && startDate <= oneWeekFromNow,
        ),
      );

    case "happening-this-month":
      return events.filter((event) =>
        getOccurrenceStarts(event).some(
          (startDate) => startDate >= now && startDate <= endOfMonth,
        ),
      );

    // "around-you" is a radius filter (handled by the caller's fetch, not a
    // date window) and "top-rated-organizers"/"category" aren't implemented
    // as date filters — both fall through unchanged, matching existing
    // behavior. (Pre-existing gap, not introduced by this refactor — see
    // PROJECT.md/audit notes on "top-rated-organizers" not being sorted.)
    default:
      return events;
  }
}
