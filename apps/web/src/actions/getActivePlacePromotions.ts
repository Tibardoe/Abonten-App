"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@/utils/logger";
import type { PlaceType } from "@abonten/types/placeType";

const FEATURED_PLACES_LIMIT = 10;

// Featured Places (Milestone 5, paid promotion) -- public read, no auth
// needed, same reasoning as getNearByPlaces.ts/getQueriedPlaces.ts. Backed
// by the get_active_place_promotions RPC (see the migration) because
// PostgREST's query builder can't express `ORDER BY random()` -- ordering is
// randomized fresh on every request in the database itself, so no single
// business can buy the top slot and permanently keep it.
//
// lat/lng/maxDistanceKm are accepted for callers that want a
// proximity-scoped slot, but are optional -- a paid, limited-inventory
// placement is deliberately called with none of them from
// PlacesTabContent.tsx, so a Featured Places purchase buys real reach
// instead of being invisible to anyone outside a narrow radius.
export async function getActivePlacePromotions(
  lat?: number | null,
  lng?: number | null,
  maxDistanceKm?: number | null,
) {
  const supabase = publicSupabase;

  const { data, error } = await supabase.rpc("get_active_place_promotions", {
    p_user_lat: lat ?? null,
    p_user_lng: lng ?? null,
    p_max_distance_km: maxDistanceKm ?? null,
    p_limit: FEATURED_PLACES_LIMIT,
  });

  if (error) {
    logger.error(`Error fetching active place promotions: ${error.message}`);
    return { status: 500, data: [] as PlaceType[] };
  }

  return { status: 200, data: (data ?? []) as PlaceType[] };
}
