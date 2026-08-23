"use server";

import { createClient } from "@/config/supabase/server";

// Ownership-scoped delete; cascades to place_review_photo via its existing
// FK (place_review_photo_review_id_fkey ... ON DELETE CASCADE). Mirrors
// deleteEventReview.ts exactly.
export async function deletePlaceReview(reviewId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("place_review")
    .delete()
    .eq("id", reviewId)
    .eq("reviewer_id", user.id)
    .select("id");

  if (deleteError) {
    console.log(`Error deleting place review: ${deleteError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!deleted || deleted.length === 0) {
    return { status: 404, message: "Review not found" };
  }

  return { status: 200, message: "Review deleted successfully!" };
}
