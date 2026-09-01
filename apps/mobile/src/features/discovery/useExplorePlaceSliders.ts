import { supabase } from "@/lib/supabase";
import type { PlaceType } from "@abonten/types/placeType";
import { useQuery } from "@tanstack/react-query";

// The Explore Places tab's curated sliders — native echo of the web
// PlacesTabContent: Featured (paid promotion), Around You (5km), Open Now,
// Top Rated. Only "All places" (a separate infinite query) honours the
// filter sheet.

const AROUND_YOU_RADIUS_KM = 5;
const WIDE_RADIUS_KM = 20;
const TOP_RATED_FETCH = 20;
const TOP_RATED_DISPLAY = 10;

async function nearby(lat: number, lng: number): Promise<PlaceType[]> {
  const { data, error } = await supabase.rpc("get_nearby_places", {
    user_lat: lat,
    user_lng: lng,
    search_radius: AROUND_YOU_RADIUS_KM,
    p_cursor_distance: null,
    p_cursor_id: null,
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
    p_search_text: null,
    p_category_id: null,
    p_min_rating: opts.minRating ?? null,
    p_open_now: opts.openNow ?? null,
    p_user_lat: lat,
    p_user_lng: lng,
    p_max_distance_km: WIDE_RADIUS_KM,
    p_cursor_distance: null,
    p_cursor_id: null,
    p_page_size: opts.pageSize,
  });
  if (error) throw error;
  return (data ?? []) as PlaceType[];
}

async function promotions(): Promise<PlaceType[]> {
  const { data, error } = await supabase.rpc("get_active_place_promotions", {
    p_user_lat: null,
    p_user_lng: null,
    p_max_distance_km: null,
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
