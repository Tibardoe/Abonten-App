import { supabase } from "@/lib/supabase";
import type { PlaceType } from "@abonten/types/placeType";
import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;
// `get_nearby_places.search_radius` is a PostGIS `geography` distance —
// METRES (ST_DWithin in the RPC body, no *1000). The web Server Action
// passes metres (SIMILAR_PLACES_RADIUS_METERS = 10000). This used to
// default to 50, i.e. a 50-metre radius, so almost nothing matched.
const DEFAULT_RADIUS_METERS = 50_000;

type Cursor = { distanceKm: number; id: string };
type Row = PlaceType & { cursor_distance_km?: number };

async function fetchPage(
  lat: number,
  lng: number,
  radiusMeters: number,
  cursor: Cursor | null,
): Promise<{ rows: Row[]; nextCursor: Cursor | null }> {
  const { data, error } = await supabase.rpc("get_nearby_places", {
    user_lat: lat,
    user_lng: lng,
    search_radius: radiusMeters,
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

// Direct `supabase.rpc("get_nearby_places")` (anon-granted), same call the
// getNearByPlaces Server Action makes. In-memory cursor. `radiusMeters`
// matches the RPC's metre-based `search_radius`.
export function useNearbyPlaces(
  coords: { lat: number; lng: number } | null,
  radiusMeters = DEFAULT_RADIUS_METERS,
) {
  const lat = coords?.lat ?? 0;
  const lng = coords?.lng ?? 0;

  return useInfiniteQuery({
    queryKey: ["discovery", "places", lat, lng, radiusMeters],
    enabled: coords != null,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(lat, lng, radiusMeters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
