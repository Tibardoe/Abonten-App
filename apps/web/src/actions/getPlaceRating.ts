"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import {
  fetchPlaceRating,
  roundRating,
} from "@abonten/services/reviews/ratingsQuery";

// Aggregate rating for one place's reviews, computed in Postgres
// (get_place_rating) rather than by transferring every approved review row.
export async function getPlaceRating(placeId: string) {
  const { average, count } = await fetchPlaceRating(publicSupabase, placeId);
  return { averageRating: roundRating(average), totalRatings: count };
}
