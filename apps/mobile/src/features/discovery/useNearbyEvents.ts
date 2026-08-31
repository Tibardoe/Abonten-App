import { supabase } from "@/lib/supabase";
import type { UserPostType } from "@abonten/types/postsType";
import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;
const DEFAULT_RADIUS_KM = 50;

type Cursor = { sortKey: string; id: string };
type Row = UserPostType & { cursor_sort_key?: string };

async function fetchPage(
  lat: number,
  lng: number,
  radiusKm: number,
  cursor: Cursor | null,
): Promise<{ rows: Row[]; nextCursor: Cursor | null }> {
  const { data, error } = await supabase.rpc("get_nearby_events", {
    user_lat: lat,
    user_lng: lng,
    search_radius: radiusKm,
    p_cursor_sort_key: cursor?.sortKey ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: PAGE_SIZE + 1,
  });

  if (error) throw error;

  const all = (data ?? []) as Row[];
  const hasNext = all.length > PAGE_SIZE;
  const rows = hasNext ? all.slice(0, PAGE_SIZE) : all;
  const last = rows[rows.length - 1];

  return {
    rows,
    nextCursor:
      hasNext && last?.cursor_sort_key
        ? { sortKey: last.cursor_sort_key, id: last.id }
        : null,
  };
}

// Direct-to-Supabase read (get_nearby_events is granted to anon +
// authenticated). Cursor is kept in memory as { sortKey, id } and passed
// straight through — no encode/decode, so no Node Buffer dependency.
export function useNearbyEvents(
  coords: { lat: number; lng: number } | null,
  radiusKm = DEFAULT_RADIUS_KM,
) {
  const lat = coords?.lat ?? 0;
  const lng = coords?.lng ?? 0;

  return useInfiniteQuery({
    queryKey: ["discovery", "nearby", lat, lng, radiusKm],
    enabled: coords != null,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(lat, lng, radiusKm, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
