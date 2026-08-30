"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@abonten/core/logger";

export async function getUserRating(reviewedId: string) {
  const supabase = publicSupabase;

  const { data: ratingsData, error } = await supabase
    .from("review")
    .select("rating")
    .eq("reviewed_id", reviewedId);

  if (error) {
    logger.error("Error fetching ratings:", error);
    throw new Error("Could not load ratings");
  }

  const totalRatings = ratingsData?.length ?? 0;

  const sum = ratingsData?.reduce((acc, { rating }) => acc + rating, 0) ?? 0;
  const averageRaw = totalRatings > 0 ? sum / totalRatings : 0;
  const averageRating = Number.parseFloat(averageRaw.toFixed(1)); // e.g. 4.3

  return { averageRating, totalRatings };
}
