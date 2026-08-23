"use server";

import { createClient } from "@/config/supabase/server";
import {
  type ReviewPhotoInput,
  insertReviewPhotos,
} from "@/utils/insertReviewPhotos";

type UpdatePlaceReviewInput = {
  reviewId: string;
  rating: number;
  title?: string;
  comment?: string;
  // Mirrors updateEventReview.ts's photo-edit support exactly.
  removedPhotoIds?: string[];
  newPhotos?: ReviewPhotoInput[];
};

// Ownership-only, mirrors updateEventReview.ts exactly -- place reviews have
// no attendance/timing gate to re-check on edit either. Rating/comment
// bounds mirror the DB constraints (place_review_rating_check,
// place_review_comment_check).
export async function updatePlaceReview(formData: UpdatePlaceReviewInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { reviewId, rating, title, comment, removedPhotoIds, newPhotos } =
    formData;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { status: 400, message: "Rating must be between 1 and 5." };
  }

  if (comment && comment.length > 500) {
    return { status: 400, message: "Comment must be 500 characters or fewer." };
  }

  const formattedTitle = title
    ? title
        .split(" ")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(" ")
    : null;

  const { data: updated, error: updateError } = await supabase
    .from("place_review")
    .update({
      rating,
      title: formattedTitle,
      comment: comment ?? null,
    })
    .eq("id", reviewId)
    .eq("reviewer_id", user.id)
    .select("id");

  if (updateError) {
    console.log(`Error updating place review: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!updated || updated.length === 0) {
    return { status: 404, message: "Review not found" };
  }

  if (removedPhotoIds?.length) {
    await supabase
      .from("place_review_photo")
      .delete()
      .eq("place_review_id", reviewId)
      .in("id", removedPhotoIds);
  }

  if (newPhotos?.length) {
    const { count } = await supabase
      .from("place_review_photo")
      .select("id", { count: "exact", head: true })
      .eq("place_review_id", reviewId);

    await insertReviewPhotos(
      supabase,
      "place_review_photo",
      "place_review_id",
      reviewId,
      `place_review_photos/${user.id}/`,
      newPhotos,
      count ?? 0,
    );
  }

  return { status: 200, message: "Review updated successfully!" };
}
