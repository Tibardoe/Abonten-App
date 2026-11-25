"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { PLACE_OWNER_EMBED } from "@abonten/core/placeOwner";
import {
  SPECIAL_HOURS_PUBLIC_DAYS,
  placeLocalDate,
} from "@abonten/core/placeSpecialHours";
import { addCalendarDays } from "@abonten/core/time/timeZone";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  fetchPlaceRating,
  roundRating,
} from "@abonten/services/reviews/ratingsQuery";

/**
 * Public read for a place's detail page — slug + status='published' scoped,
 * same "public, no auth check" reasoning as getQueriedEvents.ts/
 * getNearByEvents.ts (places are meant to be browsable signed-out).
 * Fetches opening hours/special dates/services/photos/rating alongside the
 * place row itself so the detail page has everything it needs in one round
 * trip.
 */
export const getPlaceBySlug = withActionLocale(async function getPlaceBySlug(
  slug: string,
) {
  const supabase = publicSupabase;

  // `owner` is only the owner account's status: whether anyone is behind
  // the place (placeHasOwner).
  const { data: place, error: placeError } = await supabase
    .from("place")
    .select(`*, place_category(name, slug), ${PLACE_OWNER_EMBED}`)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (placeError) {
    logger.error(`Error fetching place: ${placeError.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  if (!place) {
    return { status: 404, message: tr("placeNotFound") };
  }

  // Special dates (holidays) from yesterday (its hours may run past
  // midnight) to the end of what the page lists, on the place's calendar.
  const placeToday = placeLocalDate(new Date(), place.timezone);

  const [
    { data: openingHours, error: openingHoursError },
    { data: specialHours, error: specialHoursError },
    { data: services, error: servicesError },
    { data: photos, error: photosError },
    rating,
  ] = await Promise.all([
    supabase
      .from("place_opening_hours")
      .select("*")
      .eq("place_id", place.id)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("place_special_hours")
      .select("id, special_date, open_time, close_time, is_closed, label")
      .eq("place_id", place.id)
      .gte("special_date", addCalendarDays(placeToday, -1))
      .lt(
        "special_date",
        addCalendarDays(placeToday, SPECIAL_HOURS_PUBLIC_DAYS),
      )
      .order("special_date", { ascending: true }),
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
    // Aggregated in Postgres (get_place_rating) instead of transferring every
    // approved review row just to compute a mean and a count.
    fetchPlaceRating(supabase, place.id),
  ]);

  const firstError =
    openingHoursError ?? specialHoursError ?? servicesError ?? photosError;

  if (firstError) {
    logger.error(`Error fetching place details: ${firstError.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const reviewCount = rating.count;
  const avgRating = roundRating(rating.average);

  return {
    status: 200,
    data: {
      ...place,
      openingHours: openingHours ?? [],
      specialHours: specialHours ?? [],
      services: services ?? [],
      photos: photos ?? [],
      avgRating,
      reviewCount,
    },
  };
});
