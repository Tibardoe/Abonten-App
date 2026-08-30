"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@/utils/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@/utils/pagination";
import type {
  EventsInWindowCursor,
  PaginatedResult,
} from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";
import { addDays, endOfDay, endOfMonth, startOfDay } from "date-fns";
import { getEventAttendanceCounts } from "./getAttendace";

export type EventWindow =
  | "happening-today"
  | "happening-this-week"
  | "happening-this-month";

// Same boundary rules as the JS filter this replaces
// (getFilteredEvents.ts's filterEventsByWindow) — "this week" is a literal
// rolling 7 days from now, not the calendar week; "this month" runs to the
// end of the current calendar month, not a rolling 30 days.
function getWindowBounds(window: EventWindow): { start: Date; end: Date } {
  const now = new Date();

  switch (window) {
    case "happening-today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "happening-this-week":
      return { start: now, end: addDays(now, 7) };
    case "happening-this-month":
      return { start: now, end: endOfMonth(now) };
  }
}

export async function getEventsInWindow({
  lat,
  lng,
  radius = 10,
  window,
  cursor: rawCursor = null,
  pageSize = DEFAULT_EVENTS_PAGE_SIZE,
}: {
  lat: number;
  lng: number;
  radius?: number;
  window: EventWindow;
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<UserPostType>> {
  const supabase = publicSupabase;
  const { start, end } = getWindowBounds(window);
  const cursor = decodeCursor<EventsInWindowCursor>(rawCursor);

  const { data, error } = await supabase.rpc("get_events_in_window", {
    p_user_lat: lat,
    p_user_lng: lng,
    p_radius_km: radius,
    p_window_start: start.toISOString(),
    p_window_end: end.toISOString(),
    p_cursor_starts_at: cursor?.startsAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: pageSize,
  });

  if (error) {
    logger.error(`Error fetching events in window "${window}":`, error);
    return { status: 500, data: [], nextCursor: null, hasNextPage: false };
  }

  const { page, hasNextPage } = splitPage<UserPostType>(
    data as UserPostType[],
    pageSize,
  );

  const attendanceCounts = await getEventAttendanceCounts(
    page.map((event: UserPostType) => event.id),
  );

  const eventsWithAttendance = page.map((event: UserPostType) => ({
    ...event,
    attendanceCount: attendanceCounts[event.id] ?? 0,
  }));

  const last = page[page.length - 1] as UserPostType | undefined;

  const nextCursor =
    hasNextPage && last
      ? encodeCursor<EventsInWindowCursor>({
          startsAt: String(last.starts_at),
          id: last.id,
        })
      : null;

  return {
    status: 200,
    data: eventsWithAttendance,
    nextCursor,
    hasNextPage,
  };
}
