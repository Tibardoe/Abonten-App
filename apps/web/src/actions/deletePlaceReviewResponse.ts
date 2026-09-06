"use server";

import { createClient } from "@/config/supabase/server";
import { deletePlaceReviewResponseCore } from "@abonten/services/reviews/reviewResponseCore";
import { revalidatePath } from "next/cache";

/**
 * Owner-only removal of their reply to a place review. Thin wrapper: auth
 * here, ownership check + null-out in deletePlaceReviewResponseCore (shared
 * with /api/mobile). Idempotent — deleting an already-absent reply is a
 * success.
 */
export async function deletePlaceReviewResponse(reviewId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  const result = await deletePlaceReviewResponseCore(
    supabase,
    user.id,
    reviewId,
  );

  if (result.status === 200 && result.data?.placeSlug) {
    revalidatePath(`/places/${result.data.placeSlug}`);
  }

  return result;
}
