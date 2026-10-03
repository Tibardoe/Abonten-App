import { supabase } from "@/lib/supabase";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import {
  EXPLORE_EVENTS_RADIUS_KM,
  eventFilterArgs,
} from "@abonten/core/exploreSections";
import { viewerTimeZone } from "@abonten/core/time/timeZone";
import type { UserPostType } from "@abonten/types/postsType";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { EventFilters } from "./exploreFilters";

const PAGE_SIZE = 20;
// JSON-safe stand-in for "no distance" — matches getQueriedEvents /
// useEventSearch.
const NO_DISTANCE = 1e18;

type Cursor = { startsAt: string; distanceKm: number; id: string };

/**
 * A stretch of time laid over the filters: the "See all" of a time row
 * ("Happening today") is this list inside that row's window. With a date
 * filter also set, the list is what falls inside both. Pass the same
 * object while the screen is open (it is part of the query's key).
 */
export type EventListWindow = { from: string; to: string };

function later(a: string | undefined, b: string): string {
  return a && a > b ? a : b;
}

function earlier(a: string | undefined, b: string): string {
  return a && a < b ? a : b;
}

export async function fetchFilteredEventsPage(
  coords: { lat: number; lng: number } | null,
  f: EventFilters,
  cursor: Cursor | null,
  options: { searchText?: string; window?: EventListWindow } = {},
): Promise<{ rows: UserPostType[]; nextCursor: Cursor | null }> {
  // Days are the phone's calendar: from the first moment of the first day
  // to the last moment of the last. Every filter is optional in SQL, and
  // each end of a price or date range stands on its own ("Free" is "up to
  // 0", "Today" is one whole day).
  const args = eventFilterArgs(f, viewerTimeZone());
  const window = options.window;

  const { data, error } = await supabase.rpc("get_filtered_events", {
    ...args,
    // ISO instants in UTC compare as text.
    p_start_date: window
      ? later(args.p_start_date, window.from)
      : args.p_start_date,
    p_end_date: window ? earlier(args.p_end_date, window.to) : args.p_end_date,
    p_user_lat: coords?.lat,
    p_user_lng: coords?.lng,
    // Explore browses one area (10 km) unless a distance is chosen; a
    // search with no area has no limit.
    p_max_distance_km:
      f.maxDistanceKm ?? (coords ? EXPLORE_EVENTS_RADIUS_KM : undefined),
    p_search_text: options.searchText ?? "",
    p_cursor_starts_at: cursor?.startsAt,
    p_cursor_distance_km: cursor?.distanceKm,
    p_cursor_id: cursor?.id,
    p_page_size: PAGE_SIZE,
  });

  if (error) throw error;

  // The function returns one row more than asked when there is a next
  // page. The row is the whole card (attendance, per-tier stock); its
  // columns don't exactly match UserPostType's app-level shape (address:
  // Json, location: unknown) -- the same RPC-to-app-model boundary as the
  // other discovery hooks.
  const all = (data ?? []).map((row) =>
    withInlineEventAvailability(row),
  ) as unknown as UserPostType[];
  const hasNext = all.length > PAGE_SIZE;
  const rows = hasNext ? all.slice(0, PAGE_SIZE) : all;
  const last = rows[rows.length - 1];

  return {
    rows,
    nextCursor:
      hasNext && last
        ? {
            startsAt: String(last.starts_at),
            distanceKm: last.distance_km ?? NO_DISTANCE,
            id: last.id,
          }
        : null,
  };
}

// The Explore "All Events" list — direct `supabase.rpc("get_filtered_events")`
// (anon-granted, same call the getQueriedEvents Server Action makes on web).
// In-memory cursor, no Node Buffer dependency.
export function useFilteredEvents(
  coords: { lat: number; lng: number } | null,
  filters: EventFilters,
  window?: EventListWindow,
) {
  return useInfiniteQuery({
    queryKey: [
      "explore",
      "events",
      coords?.lat ?? 0,
      coords?.lng ?? 0,
      filters,
      window ?? null,
    ],
    enabled: coords != null,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) =>
      fetchFilteredEventsPage(coords, filters, pageParam, { window }),
    getNextPageParam: (last) => last.nextCursor,
  });
}
