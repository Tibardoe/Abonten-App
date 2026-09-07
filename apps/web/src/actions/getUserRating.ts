"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import {
  fetchUserRating,
  roundRating,
} from "@abonten/services/reviews/ratingsQuery";

// Aggregate rating left on a person (an organizer), from the generic
// `review` table. Computed in Postgres (get_user_rating) rather than by
// transferring every review row for that user.
export async function getUserRating(reviewedId: string) {
  const { average, count } = await fetchUserRating(publicSupabase, reviewedId);
  return { averageRating: roundRating(average), totalRatings: count };
}
