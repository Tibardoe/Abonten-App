import { supabase } from "@/lib/supabase";
import {
  EMPTY_PLACE_FILTERS,
  type PlaceFilters,
} from "@abonten/core/exploreFilters";
import {
  explorePlaceSectionArgs,
  splitExplorePlaceSections,
} from "@abonten/core/explorePlaceSections";
import type { PlaceType } from "@abonten/types/placeType";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

// The Explore Places tab's rows — native echo of the web PlacesTabContent:
// Featured (paid promotion), Around You (5 km), Open Now, Top Rated.
//
// The three rows come from one question to the database
// (get_explore_place_sections) with the person's filters added to it, so a
// row shows what the whole area has for those filters, by the same rule as
// the list behind it. They used to be three get_filtered_places calls, each
// finding every place in the area again. Featured is paid placement, not a
// search result: the filters do not touch it.

const TOP_RATED_DISPLAY = 10;

async function rows(lat: number, lng: number, filters: PlaceFilters) {
  const { data, error } = await supabase.rpc(
    "get_explore_place_sections",
    explorePlaceSectionArgs({ lat, lng, filters }),
  );
  if (error) throw error;
  return splitExplorePlaceSections(
    (data ?? []) as unknown as (PlaceType & { sections?: unknown })[],
  );
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
      const [featured, sections] = await Promise.all([
        promotions().catch(() => [] as PlaceType[]),
        rows(lat, lng, filters),
      ]);
      return {
        featured,
        aroundYou: sections.aroundYou,
        openNow: sections.openNow,
        // Best rated first, from the nearest well-rated places.
        topRated: sections.topRated.slice(0, TOP_RATED_DISPLAY),
      };
    },
  });

  return { ...query, data: query.data ?? EMPTY };
}
