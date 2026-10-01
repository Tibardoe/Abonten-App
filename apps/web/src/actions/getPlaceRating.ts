"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { withActionLocale } from "@/i18n/withActionLocale";
import {
  fetchPlaceRating,
  roundRating,
} from "@abonten/services/reviews/ratingsQuery";

// Aggregate rating for one place's reviews, computed in Postgres
// (get_place_rating) rather than by transferring every approved review row.
export const getPlaceRating = withActionLocale(async function getPlaceRating(
  placeId: string,
) {
  const { average, count } = await fetchPlaceRating(publicSupabase, placeId);
  return { averageRating: roundRating(average), totalRatings: count };
});
