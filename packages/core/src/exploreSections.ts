import { windowBoundsInZone } from "./eventDateWindow";
import type { EventFilters } from "./exploreFilters";
import {
  addCalendarDays,
  calendarDayOf,
  startOfCalendarDay,
} from "./time/timeZone";

// The Explore rows of events and the arguments the two event lists take,
// in one place for the website and the app.
//
// The rows (Around you, Happening today / this week / this month, From
// top-rated organizers, Featured) come from get_explore_event_sections, and
// "All events" from get_filtered_events. Both read the reader's filters
// through the same database rule, so a row and the list below it always
// agree. This module turns the filter sheet's values into what those
// functions take, and the function's rows back into rows of cards.

export const EXPLORE_EVENT_SECTIONS = [
  "featured",
  "aroundYou",
  "topRatedOrganizers",
  "happeningToday",
  "happeningThisWeek",
  "happeningThisMonth",
] as const;

export type ExploreEventSection = (typeof EXPLORE_EVENT_SECTIONS)[number];

/** The area Explore browses, and the smaller one "Around you" means. */
export const EXPLORE_EVENTS_RADIUS_KM = 10;
export const EXPLORE_AROUND_YOU_KM = 5;

/**
 * The instants a date filter covers on the reader's calendar: from the
 * first moment of the first day to the last moment of the last. One day
 * picked with no end is that whole day. Values may be days ("2026-10-12")
 * or instants (a date picker's local midnight); either is read as the day
 * it names in `zone`.
 */
export function eventFilterDateBounds(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  zone: string,
): { from: string | null; to: string | null } {
  const first = calendarDayOf(startDate || null, zone);
  const last = calendarDayOf(endDate || null, zone) ?? first;
  const from = first ? startOfCalendarDay(first, zone) : null;
  const dayAfter = last
    ? startOfCalendarDay(addCalendarDays(last, 1), zone)
    : null;
  return {
    from: from ? from.toISOString() : null,
    to: dayAfter ? new Date(dayAfter.getTime() - 1).toISOString() : null,
  };
}

/**
 * The filter arguments get_filtered_events and the rows function share.
 * Every one is optional in SQL (DEFAULT NULL), so a filter that is not set
 * is left out rather than sent as null.
 */
export type EventFilterArgs = {
  p_event_category?: string;
  p_event_type?: string[];
  p_min_price?: number;
  p_max_price?: number;
  p_start_date?: string;
  p_end_date?: string;
  p_min_rating?: number;
};

export function eventFilterArgs(
  filters: EventFilters,
  zone: string,
): EventFilterArgs {
  const { from, to } = eventFilterDateBounds(
    filters.startDate,
    filters.endDate,
    zone,
  );
  return {
    p_event_category: filters.category || undefined,
    p_event_type: filters.types.length > 0 ? filters.types : undefined,
    p_min_price: filters.minPrice ?? undefined,
    p_max_price: filters.maxPrice ?? undefined,
    p_start_date: from ?? undefined,
    p_end_date: to ?? undefined,
    p_min_rating: filters.minRating ?? undefined,
  };
}

/**
 * Arguments of get_explore_event_sections for an area: the reader's
 * filters, and where "today" and "this month" end on the reader's calendar
 * (a date that has not ended is on today when it starts by the end of
 * today, so the row needs no start). A chosen distance narrows the whole
 * area, and "Around you" with it.
 */
export function exploreEventSectionArgs(input: {
  lat: number;
  lng: number;
  filters: EventFilters;
  zone: string;
  now?: Date;
  sectionSize?: number;
  sections?: readonly ExploreEventSection[];
}) {
  const radiusKm = input.filters.maxDistanceKm ?? EXPLORE_EVENTS_RADIUS_KM;
  const { todayEnd, endOfMonth } = windowBoundsInZone(
    input.now ?? new Date(),
    input.zone,
  );
  return {
    p_user_lat: input.lat,
    p_user_lng: input.lng,
    p_radius_km: radiusKm,
    p_around_km: Math.min(EXPLORE_AROUND_YOU_KM, radiusKm),
    p_today_end: todayEnd.toISOString(),
    p_month_end: endOfMonth.toISOString(),
    ...eventFilterArgs(input.filters, input.zone),
    p_section_size: input.sectionSize ?? 20,
    p_sections: input.sections ? [...input.sections] : undefined,
  };
}

/**
 * The stretch of time a time row covers, for the full list behind it
 * (get_filtered_events with these as its dates): today on the reader's
 * calendar, the next seven days from now, or from now to the end of the
 * month. Null for a row that is not about time. The list is the whole
 * stretch, with what is already under way; the row on Explore is the part
 * of it the rows above do not show.
 */
export function exploreSectionWindow(
  section: string,
  zone: string,
  now: Date = new Date(),
): { from: string; to: string } | null {
  const { todayStart, todayEnd, endOfMonth } = windowBoundsInZone(now, zone);
  switch (section) {
    case "happeningToday":
      return { from: todayStart.toISOString(), to: todayEnd.toISOString() };
    case "happeningThisWeek":
      return {
        from: now.toISOString(),
        to: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
      };
    case "happeningThisMonth":
      return { from: now.toISOString(), to: endOfMonth.toISOString() };
    default:
      return null;
  }
}

export type ExploreEventSections<T> = Record<ExploreEventSection, T[]>;

export function emptyExploreEventSections<T>(): ExploreEventSections<T> {
  return {
    featured: [],
    aroundYou: [],
    topRatedOrganizers: [],
    happeningToday: [],
    happeningThisWeek: [],
    happeningThisMonth: [],
  };
}

/**
 * The function returns each event once, with `sections` saying which rows
 * it belongs to and where ({"aroundYou": 3, "happeningToday": 1}). This
 * lays the events out as rows, each in its own order.
 */
export function splitExploreEventSections<T extends { sections?: unknown }>(
  rows: readonly T[],
): ExploreEventSections<T> {
  const placed = emptyExploreEventSections<{ row: T; position: number }>();
  for (const row of rows) {
    const sections = row.sections;
    if (!sections || typeof sections !== "object" || Array.isArray(sections)) {
      continue;
    }
    for (const name of EXPLORE_EVENT_SECTIONS) {
      const position = (sections as Record<string, unknown>)[name];
      if (typeof position === "number" && Number.isFinite(position)) {
        placed[name].push({ row, position });
      }
    }
  }
  const out = emptyExploreEventSections<T>();
  for (const name of EXPLORE_EVENT_SECTIONS) {
    out[name] = placed[name]
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.row);
  }
  return out;
}
