"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@/utils/logger";

// Aggregate rating for one event's own reviews (event_review) -- distinct
// from getUserRating.ts, which averages the generic `review` table's rows
// about an organizer as a person, not this specific event. Unlike
// getPlaceRating.ts (which throws on error), this degrades to a 0/0 result
// instead: the event detail page awaits this directly in a Promise.all with
// no try/catch, so a thrown error here would 500 the entire page over what
// is otherwise a minor, self-contained rating widget.
export async function getEventRating(eventId: string) {
  const supabase = publicSupabase;

  const { data: ratingsData, error } = await supabase
    .from("event_review")
    .select("rating")
    .eq("event_id", eventId)
    .eq("status", "approved");

  if (error) {
    logger.error("Error fetching event ratings:", error);
    return { averageRating: 0, totalRatings: 0 };
  }

  const totalRatings = ratingsData?.length ?? 0;

  const sum = ratingsData?.reduce((acc, { rating }) => acc + rating, 0) ?? 0;
  const averageRaw = totalRatings > 0 ? sum / totalRatings : 0;
  const averageRating = Number.parseFloat(averageRaw.toFixed(1));

  return { averageRating, totalRatings };
}
