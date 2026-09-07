// Shared shape + parsing for the rating aggregate RPCs (get_event_rating,
// get_place_rating, get_user_rating, get_place_ratings -- migration
// 20260907110500).
//
// Framework-free and client-free on purpose: apps/mobile is not allowed to
// import @abonten/services (it calls the HTTP API, or Supabase directly for
// RLS-safe reads), so the pieces both sides need live here and the
// client-taking wrappers live in @abonten/services/reviews/ratingsQuery.

export type RatingAggregate = {
  /** Unrounded mean of the visible ratings; 0 when there are none. */
  average: number;
  /** Number of visible ratings. */
  count: number;
};

export const EMPTY_RATING: RatingAggregate = { average: 0, count: 0 };

export type RatingAggregateRow = {
  average_rating: number | string | null;
  total_ratings: number | null;
};

/**
 * PostgREST serialises `numeric` as a string whenever the value might not
 * survive a JS number exactly. avg() over a smallint never will, but parse
 * defensively rather than trusting the wire type.
 */
export function parseRatingAggregate(
  row: RatingAggregateRow | null | undefined,
): RatingAggregate {
  if (!row) return EMPTY_RATING;
  const average = Number(row.average_rating ?? 0);
  const count = Number(row.total_ratings ?? 0);
  return {
    average: Number.isFinite(average) ? average : 0,
    count: Number.isFinite(count) ? count : 0,
  };
}

/**
 * Display rounding. The RPCs return the mean unrounded so each surface can
 * round the way it always has (1 dp public, 2 dp admin) -- rounding in the
 * database as well would double-round and could shift a displayed value.
 */
export function roundRating(average: number, decimals = 1): number {
  return Number.parseFloat(average.toFixed(decimals));
}
