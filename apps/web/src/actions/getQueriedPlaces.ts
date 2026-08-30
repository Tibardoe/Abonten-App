"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type { PaginatedResult, PlacesCursor } from "@abonten/types/pagination";
import type { PlaceFilters, PlaceType } from "@abonten/types/placeType";

export async function getQueriedPlaces(
  queryParams: PlaceFilters,
): Promise<PaginatedResult<PlaceType>> {
  const supabase = publicSupabase;

  const {
    searchText = null,
    categoryId = null,
    minRating = null,
    openNow = null,
    lat = null,
    lng = null,
    maxDistanceKm = null,
    cursor: rawCursor = null,
    pageSize = DEFAULT_EVENTS_PAGE_SIZE,
  } = queryParams;

  const cursor = decodeCursor<PlacesCursor>(rawCursor);

  const { data, error } = await supabase.rpc("get_filtered_places", {
    p_search_text: searchText,
    p_category_id: categoryId,
    p_min_rating: minRating,
    p_open_now: openNow,
    p_user_lat: lat,
    p_user_lng: lng,
    p_max_distance_km: maxDistanceKm,
    p_cursor_distance: cursor?.distanceKm ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: pageSize,
  });

  if (error) {
    logger.error("Error fetching filtered places:", error);
    return { status: 500, data: [], nextCursor: null, hasNextPage: false };
  }

  const { page, hasNextPage } = splitPage<PlaceType>(
    data as PlaceType[],
    pageSize,
  );

  const last = page[page.length - 1] as
    | (PlaceType & { cursor_distance_km: number })
    | undefined;

  const nextCursor =
    hasNextPage && last
      ? encodeCursor<PlacesCursor>({
          distanceKm: last.cursor_distance_km,
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}
