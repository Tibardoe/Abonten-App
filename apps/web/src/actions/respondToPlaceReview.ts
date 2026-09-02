"use server";

import { createClient } from "@/config/supabase/server";
import { respondToPlaceReviewCore } from "@abonten/services/places/placeBookingsReviewsCore";

/**
 * Owner-only reply to a place review. Thin wrapper — auth here, the
 * join-through-to-place ownership check + the update in
 * respondToPlaceReviewCore (shared with /api/mobile).
 */
export async function respondToPlaceReview(reviewId: string, response: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  return respondToPlaceReviewCore(supabase, user.id, reviewId, response);
}
