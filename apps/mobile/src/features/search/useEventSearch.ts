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
  cursor: Cursor | null,
): Promise<{ rows: UserPostType[]; nextCursor: Cursor | null }> {
  const { data, error } = await supabase.rpc("get_filtered_events", {
    p_min_price: null,
    p_max_price: null,
    p_min_rating: null,
    p_user_lat: null,
    p_user_lng: null,
    p_max_distance_km: null,
    p_start_date: null,
    p_end_date: null,
    p_search_text: text,
    p_event_category: "",
    p_event_type: null,
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
// getQueriedEvents Server Action makes. Cursor kept in memory.
export function useEventSearch(query: string) {
  const text = query.trim();
  return useInfiniteQuery({
    queryKey: ["mobile", "search", "events", text],
    enabled: text.length >= MIN_QUERY_LEN,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(text, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
