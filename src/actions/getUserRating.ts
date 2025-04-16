"use server";

import { createClient } from "@/config/supabase/server";

export async function getUserRating(reviewedId: string) {
  const supabase = await createClient();

  const { data: ratingsData, error } = await supabase
    .from("review")
    .select("rating")
    .eq("reviewed_id", reviewedId);

  if (error) {
    console.error("Error fetching ratings:", error);
    throw new Error("Could not load ratings");
  }

  const totalRatings = ratingsData?.length ?? 0;

  const sum = ratingsData?.reduce((acc, { rating }) => acc + rating, 0) ?? 0;
  const averageRaw = totalRatings > 0 ? sum / totalRatings : 0;
  const averageRating = Number.parseFloat(averageRaw.toFixed(1)); // e.g. 4.3

  return { averageRating, totalRatings };
}
