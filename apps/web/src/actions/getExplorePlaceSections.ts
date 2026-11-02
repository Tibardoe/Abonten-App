"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import type { PlaceFilters } from "@abonten/core/exploreFilters";
import {
  type ExplorePlaceSections,
  emptyExplorePlaceSections,
  explorePlaceSectionArgs,
  splitExplorePlaceSections,
} from "@abonten/core/explorePlaceSections";
import { logger } from "@abonten/core/logger";
import type { PlaceType } from "@abonten/types/placeType";

/**
 * The Explore rows of places for an area (Around you, Open now, Top rated)
 * in one call, narrowed by the visitor's filters with the same rule as the
 * "All places" list. They used to be three get_filtered_places calls, each
 * finding every place in the area again.
 *
 * Public read (get_explore_place_sections is granted to anon and never
 * looks at who is asking), so it uses the cookie-free client.
 */
export async function getExplorePlaceSections(input: {
  lat: number | null;
  lng: number | null;
  filters: PlaceFilters;
}): Promise<{ status: number; data: ExplorePlaceSections<PlaceType> }> {
  const { data, error } = await publicSupabase.rpc(
    "get_explore_place_sections",
    explorePlaceSectionArgs(input),
  );

  if (error) {
    logger.error(`Error fetching the Explore place rows: ${error.message}`);
    return { status: 500, data: emptyExplorePlaceSections<PlaceType>() };
  }

  return {
    status: 200,
    data: splitExplorePlaceSections(
      (data ?? []) as unknown as (PlaceType & { sections?: unknown })[],
    ),
  };
}
