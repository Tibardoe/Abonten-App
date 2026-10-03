"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { withActionLocale } from "@/i18n/withActionLocale";
import { requestTimeZone } from "@/utils/requestTimeZone";
import { normalizeEventRow } from "@abonten/core/eventAddress";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import { eventFilterDateBounds } from "@abonten/core/exploreSections";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  FilteredEventsCursor,
  PaginatedResult,
} from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";

interface FilterParams {
  minPrice?: number | null;
  maxPrice?: number | null;
  minRating?: number | null;
  lat?: number | null;
  lng?: number | null;
  maxDistanceKm?: number | null;
  /**
   * The first and last day asked for: a day ("2026-10-12") or a date
   * picker's instant. Either end may be missing; one day alone is that day.
   */
  startDate?: string | null;
  endDate?: string | null;
  searchText?: string | null;
  category?: string | string[] | undefined;
  type?: string[] | null;
  cursor?: string | null;
  pageSize?: number;
}

export const getQueriedEvents = withActionLocale(
  async function getQueriedEvents(
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

    // Days are the visitor's: from the first moment of the first day to the
    // last moment of the last, in their browser's zone.
    const { from, to } = eventFilterDateBounds(
      startDate,
      endDate,
      await requestTimeZone(),
    );

    // Every filter of get_filtered_events is optional (DEFAULT NULL): one
    // that is not set is left out, and each bound of a range stands alone.
    const { data, error } = await supabase.rpc("get_filtered_events", {
      p_min_price: minPrice ?? undefined,
      p_max_price: maxPrice ?? undefined,
      p_min_rating: minRating ?? undefined,
      p_user_lat: lat ?? undefined,
      p_user_lng: lng ?? undefined,
      p_max_distance_km: maxDistanceKm ?? undefined,
      p_start_date: from ?? undefined,
      p_end_date: to ?? undefined,
      p_event_type: type && type.length > 0 ? type : undefined,
      p_search_text: searchText ?? "",
      // ?category may repeat in the URL; the RPC filters on one category.
      p_event_category: Array.isArray(category)
        ? (category[0] ?? "")
        : (category ?? ""),
      p_cursor_starts_at: cursor?.startsAt ?? undefined,
      p_cursor_distance_km: cursor?.distanceKm ?? undefined,
      p_cursor_id: cursor?.id ?? undefined,
      p_page_size: pageSize,
    });

    if (error) {
      logger.error("Error fetching filtered events:", error);
      return { status: 500, data: [], nextCursor: null, hasNextPage: false };
    }

    const { page, hasNextPage } = splitPage<UserPostType>(
      // The row carries attendance and per-tier stock, so a card says
      // "Sold out" here the same way it does in the rows above the list.
      (data ?? []).map((row) =>
        withInlineEventAvailability(normalizeEventRow(row)),
      ),
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
  },
);
