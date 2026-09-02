import {
  EMPTY_EVENT_FILTERS,
  type EventFilters,
  PRICE_ANY_MAX,
  countActiveEventFilters,
} from "@/features/discovery/exploreFilters";
import { supabase } from "@/lib/supabase";
import type { UserPostType } from "@abonten/types/postsType";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const PAGE_SIZE = 20;
const MIN_QUERY_LEN = 2;
// JSON-safe stand-in for "no distance" — matches getQueriedEvents.
const NO_DISTANCE = 1e18;

type Cursor = { startsAt: string; distanceKm: number; id: string };

export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

async function fetchPage(
  text: string,
  filters: EventFilters,
  cursor: Cursor | null,
): Promise<{ rows: UserPostType[]; nextCursor: Cursor | null }> {
  // Same filter -> RPC-param mapping as useFilteredEvents (the Explore "All
  // events" list): null (not []) for an empty type list so the RPC's null
  // short-circuit applies, and the [0, 999] "Any price" sentinel drops the
  // upper bound. This mirrors the web /search page, which runs the ticket
  // filters through getQueriedEvents.
  const normalizedType = filters.types.length > 0 ? filters.types : null;
  const maxPrice =
    filters.maxPrice != null && filters.maxPrice < PRICE_ANY_MAX
      ? filters.maxPrice
      : null;

  const { data, error } = await supabase.rpc("get_filtered_events", {
    p_min_price: filters.minPrice,
    p_max_price: maxPrice,
    p_min_rating: filters.minRating,
    p_user_lat: null,
    p_user_lng: null,
    p_max_distance_km: filters.maxDistanceKm,
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_search_text: text,
    p_event_category: filters.category ?? "",
    p_event_type: normalizedType,
    p_cursor_starts_at: cursor?.startsAt ?? null,
    p_cursor_distance_km: cursor?.distanceKm ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: PAGE_SIZE + 1,
  });

  if (error) throw error;

  const all = (data ?? []) as UserPostType[];
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

// Direct `supabase.rpc("get_filtered_events")` (anon-granted), same call the
// getQueriedEvents Server Action makes. Cursor kept in memory. `filters` is
// the Search screen's Filter-sheet state (defaults to "no filters").
export function useEventSearch(
  query: string,
  filters: EventFilters = EMPTY_EVENT_FILTERS,
) {
  const text = query.trim();
  return useInfiniteQuery({
    queryKey: ["mobile", "search", "events", text, filters],
    // A query OR at least one active filter is enough to run — the web
    // /search route likewise lists filtered events with no free-text term.
    enabled:
      text.length >= MIN_QUERY_LEN || countActiveEventFilters(filters) > 0,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(text, filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
