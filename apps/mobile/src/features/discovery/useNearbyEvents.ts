import { supabase } from "@/lib/supabase";
import { withInlineEventAvailability } from "@abonten/core/eventAvailability";
import type { UserPostType } from "@abonten/types/postsType";
import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;
// `get_nearby_events.search_radius` is metres (PostGIS `geography`), same as
// the web getNearByEvents(lat,lng,10000) call.
const DEFAULT_RADIUS_METERS = 50_000;

type Cursor = { sortKey: string; id: string };
type Row = UserPostType & { cursor_sort_key?: string };

async function fetchPage(
  lat: number,
  lng: number,
  radiusMeters: number,
  cursor: Cursor | null,
): Promise<{ rows: Row[]; nextCursor: Cursor | null }> {
  const { data, error } = await supabase.rpc("get_nearby_events", {
    user_lat: lat,
    user_lng: lng,
    search_radius: radiusMeters,
    p_cursor_sort_key: cursor?.sortKey,
    p_cursor_id: cursor?.id,
    p_page_size: PAGE_SIZE,
  });

  if (error) throw error;

  // Soonest first, and one row more than asked when there is a next page.
  // The row is the whole card (attendance, per-tier stock); its columns
  // don't exactly match UserPostType's app-level shape (address: Json,
  // location: unknown) -- the same RPC-to-app-model boundary as the other
  // discovery hooks.
  const all = (data ?? []).map((row) =>
    withInlineEventAvailability(row),
  ) as unknown as Row[];
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
  radiusMeters = DEFAULT_RADIUS_METERS,
) {
  const lat = coords?.lat ?? 0;
  const lng = coords?.lng ?? 0;

  return useInfiniteQuery({
    queryKey: ["discovery", "nearby", lat, lng, radiusMeters],
    enabled: coords != null,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(lat, lng, radiusMeters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
