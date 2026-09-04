import { supabase } from "@/lib/supabase";
import type { PlaceType } from "@abonten/types/placeType";
import { useQuery } from "@tanstack/react-query";

// The Explore Places tab's curated sliders — native echo of the web
// PlacesTabContent: Featured (paid promotion), Around You (5km), Open Now,
// Top Rated. Only "All places" (a separate infinite query) honours the
// filter sheet.

// `get_nearby_places.search_radius` is a PostGIS `geography` distance —
// METRES (matches the web getNearByPlaces(lat,lng,5000) call). Passing 5
// here searched a 5-metre radius. `WIDE_RADIUS_KM` below feeds
// `p_max_distance_km`, which the RPC multiplies by 1000, so that one stays
// in kilometres.
const AROUND_YOU_RADIUS_METERS = 5_000;
const WIDE_RADIUS_KM = 20;
const TOP_RATED_FETCH = 20;
const TOP_RATED_DISPLAY = 10;

async function nearby(lat: number, lng: number): Promise<PlaceType[]> {
  const { data, error } = await supabase.rpc("get_nearby_places", {
    user_lat: lat,
    user_lng: lng,
    search_radius: AROUND_YOU_RADIUS_METERS,
    // These params are all `DEFAULT NULL` in SQL -- `undefined` (dropped
    // from the JSON body entirely) reaches the function exactly the same
    // as an explicit `null` would, but satisfies the generated optional
    // (`?:`) arg type.
    p_cursor_distance: undefined,
    p_cursor_id: undefined,
    p_page_size: 20,
  });
  if (error) throw error;
  return (data ?? []) as PlaceType[];
}

async function filtered(
  lat: number,
  lng: number,
  opts: { openNow?: boolean; minRating?: number; pageSize: number },
): Promise<PlaceType[]> {
  const { data, error } = await supabase.rpc("get_filtered_places", {
    // All `DEFAULT NULL`/optional in SQL -- see the comment in nearby()
    // above for why `undefined` replaces `null` here.
    p_search_text: undefined,
    p_category_id: undefined,
    p_min_rating: opts.minRating,
    p_open_now: opts.openNow,
    p_user_lat: lat,
    p_user_lng: lng,
    p_max_distance_km: WIDE_RADIUS_KM,
    p_cursor_distance: undefined,
    p_cursor_id: undefined,
    p_page_size: opts.pageSize,
  });
  if (error) throw error;
  return (data ?? []) as PlaceType[];
}

async function promotions(): Promise<PlaceType[]> {
  const { data, error } = await supabase.rpc("get_active_place_promotions", {
    p_user_lat: undefined,
    p_user_lng: undefined,
    p_max_distance_km: undefined,
    p_limit: 10,
  });
  if (error) throw error;
  return (data ?? []) as PlaceType[];
}

export type PlaceSliders = {
  featured: PlaceType[];
  aroundYou: PlaceType[];
  openNow: PlaceType[];
  topRated: PlaceType[];
};

const EMPTY: PlaceSliders = {
  featured: [],
  aroundYou: [],
  openNow: [],
  topRated: [],
};

export function useExplorePlaceSliders(
  coords: { lat: number; lng: number } | null,
) {
  const lat = coords?.lat ?? 0;
  const lng = coords?.lng ?? 0;

  const query = useQuery({
    queryKey: ["explore", "place-sliders", lat, lng],
    enabled: coords != null,
    queryFn: async (): Promise<PlaceSliders> => {
      const [featured, aroundYou, openNow, topRatedRaw] = await Promise.all([
        promotions().catch(() => [] as PlaceType[]),
        nearby(lat, lng),
        filtered(lat, lng, { openNow: true, pageSize: 10 }),
        filtered(lat, lng, { minRating: 4, pageSize: TOP_RATED_FETCH }),
      ]);

      // get_filtered_places orders by distance, not rating — re-sort the
      // small radius+minRating page client-side for display, same as web.
      const topRated = [...topRatedRaw]
        .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
        .slice(0, TOP_RATED_DISPLAY);

      return { featured, aroundYou, openNow, topRated };
    },
  });

  return { ...query, data: query.data ?? EMPTY };
}
