import type { UserPostType } from "@/types/postsType";
import { getNearByEvents } from "./getNearByEvents";

export type EventDateFilter =
  | "happening-today"
  | "happening-this-week"
  | "happening-this-month"
  | "top-rated-organizers"
  | "category"
  | "around-you";

/**
 * Pure, synchronous date-window filter — no fetching. Split out from
 * `getFilteredEvents` so callers that already have an events dataset in
 * hand (e.g. one shared "nearby events" fetch reused across several
 * sliders) can derive each slice without re-fetching per filter.
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
      return events.filter((event) => {
        if (!event.starts_at) return false;
        const startDate = new Date(event.starts_at);
        return startDate >= todayStart && startDate <= todayEnd;
      });

    case "happening-this-week":
      return events.filter((event) => {
        if (!event.starts_at) return false;
        const startDate = new Date(event.starts_at);
        return startDate >= now && startDate <= oneWeekFromNow;
      });

    case "happening-this-month":
      return events.filter((event) => {
        if (!event.starts_at) return false;
        const startDate = new Date(event.starts_at);
        return startDate >= now && startDate <= endOfMonth;
      });

    // "around-you" is a radius filter (handled by the caller's fetch, not a
    // date window) and "top-rated-organizers"/"category" aren't implemented
    // as date filters — both fall through unchanged, matching existing
    // behavior. (Pre-existing gap, not introduced by this refactor — see
    // PROJECT.md/audit notes on "top-rated-organizers" not being sorted.)
    default:
      return events;
  }
}

export async function getFilteredEvents({
  lat,
  lng,
  filter,
  radius = 10, // default to 10km if not provided
}: {
  lat: number;
  lng: number;
  radius?: number;
  filter: EventDateFilter;
}) {
  const { data: events, error } = await getNearByEvents(
    lat,
    lng,
    filter === "around-you" ? 5 : radius,
  );

  if (error || !events) return [];

  return filterEventsByWindow(events, filter);
}
