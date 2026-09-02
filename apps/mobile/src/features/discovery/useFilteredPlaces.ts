import { supabase } from "@/lib/supabase";
import type { PlaceType } from "@abonten/types/placeType";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { PlaceFilters } from "./exploreFilters";

const PAGE_SIZE = 20;

// Same null-radius trap as useFilteredEvents: get_filtered_places gates rows
// on `ST_DWithin(..., p_max_distance_km * 1000)`, so a null radius with real
// coords filters everything out. Web's PlacesTabContent always passes
// `maxDistanceKm ?? EXPLORE_PLACES_RADIUS_KM` (20) — mirror that; the Filter
// sheet's Distance field overrides it.
const DEFAULT_RADIUS_KM = 20;

type Cursor = { distanceKm: number; id: string };
type Row = PlaceType & { cursor_distance_km?: number };

async function fetchPage(
  coords: { lat: number; lng: number } | null,
  f: PlaceFilters,
  cursor: Cursor | null,
): Promise<{ rows: Row[]; nextCursor: Cursor | null }> {
  const { data, error } = await supabase.rpc("get_filtered_places", {
    p_search_text: null,
    p_category_id: f.categoryId,
    p_min_rating: f.minRating,
    p_open_now: f.openNow ? true : null,
    p_user_lat: coords?.lat ?? null,
    p_user_lng: coords?.lng ?? null,
    p_max_distance_km: f.maxDistanceKm ?? DEFAULT_RADIUS_KM,
    p_cursor_distance: cursor?.distanceKm ?? null,
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
      hasNext && last && typeof last.cursor_distance_km === "number"
        ? { distanceKm: last.cursor_distance_km, id: last.id }
        : null,
  };
}

// The Explore "All Places" list — direct `supabase.rpc("get_filtered_places")`
// (anon-granted, same call the getQueriedPlaces Server Action makes on web).
export function useFilteredPlaces(
  coords: { lat: number; lng: number } | null,
  filters: PlaceFilters,
) {
  return useInfiniteQuery({
    queryKey: [
      "explore",
      "places",
      coords?.lat ?? 0,
      coords?.lng ?? 0,
      filters,
    ],
    enabled: coords != null,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(coords, filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
