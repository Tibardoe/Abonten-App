import { logger } from "@abonten/core/logger";
import {
  EMPTY_RATING,
  type RatingAggregate,
  type RatingAggregateRow,
  parseRatingAggregate,
} from "@abonten/core/ratings";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export { roundRating } from "@abonten/core/ratings";
export type { RatingAggregate } from "@abonten/core/ratings";

// The single source of truth for "what is this thing's rating?".
//
// Before this module, eight call sites across web, mobile and admin each
// selected every review row for an entity and averaged them in JavaScript.
// That transferred the whole review history to compute two numbers, and the
// two admin sites additionally capped the fetch at 5000 rows -- which does
// not fail loudly, it just returns a wrong average once an entity passes
// 5000 reviews.
//
// The aggregation now happens in Postgres via purpose-built RPCs
// (migration 20260907110500). Those are SECURITY INVOKER, so RLS still
// applies exactly as it did when the app selected the rows itself, and each
// one states the public-visibility predicate explicitly (status approved,
// moderation_state not hidden/removed) so every caller -- including admin's
// service-role client, which bypasses RLS -- sees the same number the public
// sees.
//
// Averages come back UNROUNDED. Callers apply their own display rounding
// (1 dp on public surfaces, 2 dp in admin), which is what they already did;
// rounding here too would double-round and could shift a displayed value.

/** Aggregate rating for one event's own reviews (`event_review`). */
export async function fetchEventRating(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<RatingAggregate> {
  const { data, error } = await supabase
    .rpc("get_event_rating", { p_event_id: eventId })
    .maybeSingle();

  if (error) {
    logger.error(`Error fetching event rating: ${error.message}`);
    return EMPTY_RATING;
  }
  return parseRatingAggregate(data as RatingAggregateRow | null);
}

/** Aggregate rating for one place's reviews (`place_review`). */
export async function fetchPlaceRating(
  supabase: SupabaseClient<Database>,
  placeId: string,
): Promise<RatingAggregate> {
  const { data, error } = await supabase
    .rpc("get_place_rating", { p_place_id: placeId })
    .maybeSingle();

  if (error) {
    logger.error(`Error fetching place rating: ${error.message}`);
    return EMPTY_RATING;
  }
  return parseRatingAggregate(data as RatingAggregateRow | null);
}

/**
 * Aggregate rating left on a *person* (an organizer), from the generic
 * `review` table. Distinct from fetchEventRating, which is about one event.
 */
export async function fetchUserRating(
  supabase: SupabaseClient<Database>,
  reviewedId: string,
): Promise<RatingAggregate> {
  const { data, error } = await supabase
    .rpc("get_user_rating", { p_reviewed_id: reviewedId })
    .maybeSingle();

  if (error) {
    logger.error(`Error fetching user rating: ${error.message}`);
    return EMPTY_RATING;
  }
  return parseRatingAggregate(data as RatingAggregateRow | null);
}

/**
 * Batch variant for list surfaces that render many places at once. One round
 * trip and one grouped aggregate -- never one query per card. Places with no
 * visible reviews are simply absent from the result, so callers should fall
 * back to a zero aggregate.
 */
export async function fetchPlaceRatings(
  supabase: SupabaseClient<Database>,
  placeIds: string[],
): Promise<Record<string, RatingAggregate>> {
  if (placeIds.length === 0) return {};

  const { data, error } = await supabase.rpc("get_place_ratings", {
    p_place_ids: placeIds,
  });

  if (error) {
    logger.error(`Error fetching place rating aggregates: ${error.message}`);
    return {};
  }

  const out: Record<string, RatingAggregate> = {};
  for (const row of (data ?? []) as (RatingAggregateRow & {
    place_id: string;
  })[]) {
    out[row.place_id] = parseRatingAggregate(row);
  }
  return out;
}
