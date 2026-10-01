"use server";

import { createClient } from "@/config/supabase/server";
import { revalidateAppPath } from "@/lib/revalidateAppPath";
import { respondToPlaceReviewCore } from "@abonten/services/reviews/reviewResponseCore";

/**
 * Owner reply to a place review — create OR edit (the core detects which
 * from whether a reply already exists). Thin wrapper: auth here, the
 * join-through-to-place ownership check + validation + update in
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

  const result = await respondToPlaceReviewCore(
    supabase,
    user.id,
    reviewId,
    response,
  );

  if (result.status === 200 && result.data?.placeSlug) {
    revalidateAppPath(`/places/${result.data.placeSlug}`);
  }

  return result;
}
