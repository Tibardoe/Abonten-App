import { supabase } from "@/lib/supabase";
import {
  EMPTY_PLACE_FILTERS,
  type PlaceFilters,
} from "@abonten/core/exploreFilters";
import type { PlaceType } from "@abonten/types/placeType";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

// The Explore Places tab's rows — native echo of the web PlacesTabContent:
// Featured (paid promotion), Around You (5 km), Open Now, Top Rated.
//
// Each row is its own question to the database (nearest, open now, rated 4
// or better) with the person's filters added to it, so a row shows what the
// whole area has for those filters. The rows used to be fetched without the
// filters and narrowed on the phone, which left "Open now" with whatever
// restaurants happened to be among the ten nearest open places. Featured is
// paid placement, not a search result: the filters do not touch it.

// `p_max_distance_km` is kilometres (the RPC multiplies by 1000).
const AROUND_YOU_RADIUS_KM = 5;
const WIDE_RADIUS_KM = 20;
const AROUND_YOU_SIZE = 20;
const OPEN_NOW_SIZE = 10;
// "Top rated" means rated 4 or better, unless the person asked for more.
const TOP_RATED_MIN_RATING = 4;
const TOP_RATED_FETCH = 20;
const TOP_RATED_DISPLAY = 10;

async function filtered(
  lat: number,
  lng: number,
  f: PlaceFilters,
  row: {
    openNow?: boolean;
    minRating?: number;
    maxDistanceKm: number;
    pageSize: number;
  },
): Promise<PlaceType[]> {
  const { data, error } = await supabase.rpc("get_filtered_places", {
    // All `DEFAULT NULL`/optional in SQL: a filter that is not set is left
    // out (`undefined` is dropped from the JSON body).
    p_category_id: f.categoryId ?? undefined,
    p_min_rating:
      row.minRating != null || f.minRating != null
        ? Math.max(row.minRating ?? 0, f.minRating ?? 0)
        : undefined,
    p_open_now: row.openNow || f.openNow ? true : undefined,
    p_user_lat: lat,
    p_user_lng: lng,
    p_max_distance_km: Math.min(
      row.maxDistanceKm,
      f.maxDistanceKm ?? row.maxDistanceKm,
    ),
    p_page_size: row.pageSize,
  });
  if (error) throw error;
  // The function returns one row more than asked when there is a next page.
  return ((data ?? []) as PlaceType[]).slice(0, row.pageSize);
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
  filters: PlaceFilters = EMPTY_PLACE_FILTERS,
) {
  const lat = coords?.lat ?? 0;
  const lng = coords?.lng ?? 0;

  const query = useQuery({
    queryKey: ["explore", "place-sliders", lat, lng, filters],
    enabled: coords != null,
    // A filter change asks again; the rows already on screen stay until
    // the answer is in, instead of blinking out.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PlaceSliders> => {
      const [featured, aroundYou, openNow, topRatedRaw] = await Promise.all([
        promotions().catch(() => [] as PlaceType[]),
        filtered(lat, lng, filters, {
          maxDistanceKm: AROUND_YOU_RADIUS_KM,
          pageSize: AROUND_YOU_SIZE,
        }),
        filtered(lat, lng, filters, {
          openNow: true,
          maxDistanceKm: WIDE_RADIUS_KM,
          pageSize: OPEN_NOW_SIZE,
        }),
        filtered(lat, lng, filters, {
          minRating: TOP_RATED_MIN_RATING,
          maxDistanceKm: WIDE_RADIUS_KM,
          pageSize: TOP_RATED_FETCH,
        }),
      ]);

      // get_filtered_places orders by distance: the well-rated places
      // nearest to here, shown best first, same as web.
      const topRated = [...topRatedRaw]
        .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
        .slice(0, TOP_RATED_DISPLAY);

      return { featured, aroundYou, openNow, topRated };
    },
  });

  return { ...query, data: query.data ?? EMPTY };
}
