"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  NearbyEventsCursor,
  PaginatedResult,
} from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";
import { getEventAttendanceCounts } from "./getAttendace";

export async function getNearByEvents(
  lat: number,
  lng: number,
  radius: number,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<UserPostType>> {
  const supabase = publicSupabase;
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<NearbyEventsCursor>(options?.cursor);

  const { data, error } = await supabase.rpc("get_nearby_events", {
    user_lat: lat,
    user_lng: lng,
    search_radius: radius,
    p_cursor_sort_key: cursor?.sortKey ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: pageSize,
  });

  if (error) {
    logger.error(`Error fetching get nearby events: ${error.message}`);

    return { status: 500, data: [], nextCursor: null, hasNextPage: false };
  }

  const { page, hasNextPage } = splitPage<UserPostType>(
    data as UserPostType[],
    pageSize,
  );

  // Attach attendance counts for this page only, via a single grouped
  // query instead of one round trip per event.
  const attendanceCounts = await getEventAttendanceCounts(
    page.map((event: UserPostType) => event.id),
  );

  const eventsWithAttendance = page.map((event: UserPostType) => ({
    ...event,
    attendanceCount: attendanceCounts[event.id] ?? 0,
  }));

  const last = page[page.length - 1] as
    | (UserPostType & { cursor_sort_key: string })
    | undefined;

  const nextCursor =
    hasNextPage && last
      ? encodeCursor<NearbyEventsCursor>({
          sortKey: last.cursor_sort_key,
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
