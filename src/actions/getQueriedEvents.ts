"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import type { FilteredEventsCursor, PaginatedResult } from "@/types/pagination";
import type { UserPostType } from "@/types/postsType";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@/utils/pagination";

interface FilterParams {
  minPrice?: number | null;
  maxPrice?: number | null;
  minRating?: number | null;
  lat?: number | null;
  lng?: number | null;
  maxDistanceKm?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  searchText?: string | null;
  category?: string | string[] | undefined;
  type?: string | string[] | undefined;
  cursor?: string | null;
  pageSize?: number;
}

export async function getQueriedEvents(
  queryParams: FilterParams,
): Promise<PaginatedResult<UserPostType>> {
  const supabase = publicSupabase;

  const {
    minPrice = null,
    maxPrice = null,
    minRating = null,
    lat = null,
    lng = null,
    maxDistanceKm = null,
    startDate = null,
    endDate = null,
    searchText = null,
    category = null,
    type = null,
    cursor: rawCursor = null,
    pageSize = DEFAULT_EVENTS_PAGE_SIZE,
  } = queryParams;

  const cursor = decodeCursor<FilteredEventsCursor>(rawCursor);

  const { data, error } = await supabase.rpc("get_filtered_events", {
    p_min_price: minPrice,
    p_max_price: maxPrice,
    p_min_rating: minRating,
    p_user_lat: lat,
    p_user_lng: lng,
    p_max_distance_km: maxDistanceKm,
    p_start_date: startDate,
    p_end_date: endDate,
    p_search_text: searchText ?? "",
    p_event_category: category ?? "",
    p_event_type: type ?? "",
    p_cursor_starts_at: cursor?.startsAt ?? null,
    p_cursor_distance_km: cursor?.distanceKm ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: pageSize,
  });

  if (error) {
    console.error("Error fetching filtered events:", error);
    return { status: 500, data: [], nextCursor: null, hasNextPage: false };
  }

  const { page, hasNextPage } = splitPage<UserPostType>(
    data as UserPostType[],
    pageSize,
  );
  const last = page[page.length - 1] as UserPostType | undefined;

  // Matches the SQL-side sentinel for "no distance" (no lat/lng given) —
  // JSON.stringify(Infinity) serializes to `null`, which would corrupt the
  // cursor, so a plain large number is used instead.
  const NO_DISTANCE_SENTINEL = 1e18;

  const nextCursor =
    hasNextPage && last
      ? encodeCursor<FilteredEventsCursor>({
          startsAt: String(last.starts_at),
          distanceKm: last.distance_km ?? NO_DISTANCE_SENTINEL,
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}
