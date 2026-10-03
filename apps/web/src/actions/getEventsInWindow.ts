"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { withActionLocale } from "@/i18n/withActionLocale";
import { requestTimeZone } from "@/utils/requestTimeZone";
import { normalizeEventRow } from "@abonten/core/eventAddress";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import { windowBoundsInZone } from "@abonten/core/eventDateWindow";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  EventsInWindowCursor,
  PaginatedResult,
} from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";
import { addDays } from "date-fns";

export type EventWindow =
  | "happening-today"
  | "happening-this-week"
  | "happening-this-month";

// The same windows as the Explore rows (get_explore_event_sections): "this
// week" is a literal rolling 7 days from now, not the calendar week; "this
// month" runs to the end of the current calendar month, not a rolling 30
// days. "Today" and "this month" are the visitor's (their browser's zone),
// not the server's UTC clock.
function getWindowBounds(
  window: EventWindow,
  timeZone: string,
): { start: Date; end: Date } {
  const now = new Date();
  const bounds = windowBoundsInZone(now, timeZone);

  switch (window) {
    case "happening-today":
      return { start: bounds.todayStart, end: bounds.todayEnd };
    case "happening-this-week":
      return { start: now, end: addDays(now, 7) };
    case "happening-this-month":
      return { start: now, end: bounds.endOfMonth };
  }
}

export const getEventsInWindow = withActionLocale(
  async function getEventsInWindow({
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
    const { start, end } = getWindowBounds(window, await requestTimeZone());
    const cursor = decodeCursor<EventsInWindowCursor>(rawCursor);

    const { data, error } = await supabase.rpc("get_events_in_window", {
      p_user_lat: lat,
      p_user_lng: lng,
      p_radius_km: radius,
      p_window_start: start.toISOString(),
      p_window_end: end.toISOString(),
      p_cursor_starts_at: cursor?.startsAt ?? undefined,
      p_cursor_id: cursor?.id ?? undefined,
      p_page_size: pageSize,
    });

    if (error) {
      logger.error(`Error fetching events in window "${window}":`, error);
      return { status: 500, data: [], nextCursor: null, hasNextPage: false };
    }

    // The row carries attendance and per-tier stock inline (this used to
    // be a second request per page).
    const { page, hasNextPage } = splitPage<UserPostType>(
      (data ?? []).map((row) =>
        withInlineEventAvailability(normalizeEventRow(row)),
      ),
      pageSize,
    );

    const last = page[page.length - 1] as UserPostType | undefined;

    const nextCursor =
      hasNextPage && last
        ? encodeCursor<EventsInWindowCursor>({
            startsAt: String(last.starts_at),
            id: last.id,
          })
        : null;

    return { status: 200, data: page, nextCursor, hasNextPage };
  },
);
