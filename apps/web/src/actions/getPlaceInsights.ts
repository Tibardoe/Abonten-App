"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

// Owner-only analytics dashboard query. A simple select + reduce in JS is
// fine here (rather than a Postgres RPC) -- this is a small, infrequently
// viewed owner dashboard, not a hot path.
export async function getPlaceInsights(placeId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  // The spec's insights example also wants Favorites and Reviews counts,
  // which live outside place_analytics_event (favorite_place/place_review)
  // -- fetched alongside the event-type rows in one Promise.all rather than
  // sequentially, same low-traffic-dashboard reasoning as the comment above.
  const [eventsResult, favoritesResult, reviewsResult] = await Promise.all([
    supabase
      .from("place_analytics_event")
      .select("event_type")
      .eq("place_id", placeId),
    supabase
      .from("favorite_place")
      .select("id", { count: "exact", head: true })
      .eq("place_id", placeId),
    supabase
      .from("place_review")
      .select("id", { count: "exact", head: true })
      .eq("place_id", placeId)
      .eq("status", "approved"),
  ]);

  if (eventsResult.error || favoritesResult.error || reviewsResult.error) {
    const message =
      eventsResult.error?.message ??
      favoritesResult.error?.message ??
      reviewsResult.error?.message;
    logger.error(`Error fetching place insights: ${message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const counts = (eventsResult.data ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.event_type] = (acc[row.event_type] ?? 0) + 1;
      return acc;
    },
    {},
  );

  counts.favorites = favoritesResult.count ?? 0;
  counts.reviews = reviewsResult.count ?? 0;

  return { status: 200, data: counts };
}
