"use server";

import { publicSupabase } from "@/config/supabase/publicClient";

export async function getPlaceRating(placeId: string) {
  const supabase = publicSupabase;

  const { data: ratingsData, error } = await supabase
    .from("place_review")
    .select("rating")
    .eq("place_id", placeId)
    .eq("status", "approved");

  if (error) {
    console.error("Error fetching place ratings:", error);
    throw new Error("Could not load ratings");
  }

  const totalRatings = ratingsData?.length ?? 0;

  const sum = ratingsData?.reduce((acc, { rating }) => acc + rating, 0) ?? 0;
  const averageRaw = totalRatings > 0 ? sum / totalRatings : 0;
  const averageRating = Number.parseFloat(averageRaw.toFixed(1)); // e.g. 4.3

  return { averageRating, totalRatings };
}
