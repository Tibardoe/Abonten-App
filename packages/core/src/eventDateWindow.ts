import type { UserPostType } from "@abonten/types/postsType";

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

    case "top-rated-organizers":
      return rankByOrganizerRating(events);

    // "around-you" is a radius filter (handled by the caller's fetch, not a
    // date window) and "category" isn't a date filter — both fall through
    // unchanged.
    default:
      return events;
  }
}

function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * "Top-rated organizers": the nearby events whose organizer has at least one
 * visible review, best-rated first, ties broken by how many people rated
 * them (a 4.5 from twelve reviewers outranks a 4.5 from two). The figures
 * come from get_nearby_events' `organizer_avg_rating` /
 * `organizer_rating_count` columns (migration 20260910165605), which use
 * the same visibility predicate as get_user_rating.
 *
 * Rows that carry no rating fields at all — a producer that predates those
 * columns — are returned unchanged so the slider never blanks out on stale
 * data; that was the previous behaviour for every row.
 */
function rankByOrganizerRating(events: UserPostType[]): UserPostType[] {
  const carriesRating = events.some(
    (e) => e.organizer_rating_count !== undefined,
  );
  if (!carriesRating) return events;

  return events
    .filter((e) => num(e.organizer_rating_count) > 0)
    .sort(
      (a, b) =>
        num(b.organizer_avg_rating) - num(a.organizer_avg_rating) ||
        num(b.organizer_rating_count) - num(a.organizer_rating_count),
    );
}
