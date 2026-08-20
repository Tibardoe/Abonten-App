"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import type { PaginatedResult, PlacesCursor } from "@/types/pagination";
import type { PlaceType } from "@/types/placeType";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@/utils/pagination";

export async function getNearByPlaces(
  lat: number,
  lng: number,
  radius: number,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<PlaceType>> {
  const supabase = publicSupabase;
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<PlacesCursor>(options?.cursor);

  const { data, error } = await supabase.rpc("get_nearby_places", {
    user_lat: lat,
    user_lng: lng,
    search_radius: radius,
    p_cursor_distance: cursor?.distanceKm ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: pageSize,
  });

  if (error) {
    console.log(`Error fetching get nearby places: ${error.message}`);

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

  return {
    status: 200,
    data: page,
    nextCursor,
    hasNextPage,
  };
}
