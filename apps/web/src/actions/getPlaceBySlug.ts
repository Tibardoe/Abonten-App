"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@abonten/core/logger";

/**
 * Public read for a place's detail page — slug + status='published' scoped,
 * same "public, no auth check" reasoning as getQueriedEvents.ts/
 * getNearByEvents.ts (places are meant to be browsable signed-out).
 * Fetches opening hours/services/photos/rating alongside the place row
 * itself so the detail page has everything it needs in one round trip.
 */
export async function getPlaceBySlug(slug: string) {
  const supabase = publicSupabase;

  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("*, place_category(name, slug)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (placeError) {
    logger.error(`Error fetching place: ${placeError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!place) {
    return { status: 404, message: "Place not found" };
  }

  const [
    { data: openingHours, error: openingHoursError },
    { data: services, error: servicesError },
    { data: photos, error: photosError },
    { data: reviews, error: reviewsError },
  ] = await Promise.all([
    supabase
      .from("place_opening_hours")
      .select("*")
      .eq("place_id", place.id)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("place_service")
      .select("*")
      .eq("place_id", place.id)
      .order("position", { ascending: true }),
    supabase
      .from("place_photo")
      .select("*")
      .eq("place_id", place.id)
      .order("position", { ascending: true }),
    supabase
      .from("place_review")
      .select("rating")
      .eq("place_id", place.id)
      .eq("status", "approved"),
  ]);

  const firstError =
    openingHoursError ?? servicesError ?? photosError ?? reviewsError;

  if (firstError) {
    logger.error(`Error fetching place details: ${firstError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const reviewCount = reviews?.length ?? 0;
  const avgRating =
    reviewCount > 0
      ? Number.parseFloat(
          (
            (reviews ?? []).reduce((sum, r) => sum + r.rating, 0) / reviewCount
          ).toFixed(1),
        )
      : 0;

  return {
    status: 200,
    data: {
      ...place,
      openingHours: openingHours ?? [],
      services: services ?? [],
      photos: photos ?? [],
      avgRating,
      reviewCount,
    },
  };
}
