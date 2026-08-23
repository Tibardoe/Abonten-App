"use server";

import { createClient } from "@/config/supabase/server";
import {
  type ReviewPhotoInput,
  insertReviewPhotos,
} from "@/utils/insertReviewPhotos";

type UpdateEventReviewInput = {
  reviewId: string;
  rating: number;
  title?: string;
  comment?: string;
  // Ids of this review's own event_review_photo rows the user removed in the
  // edit modal, and any newly uploaded photos to attach -- both optional
  // since most edits only touch rating/title/comment.
  removedPhotoIds?: string[];
  newPhotos?: ReviewPhotoInput[];
};

// Ownership-only: re-checking attendance/event-ended here would let the
// event's later lifecycle changes retroactively invalidate an already-valid
// review, which getEventReviewEligibility.ts deliberately avoids by letting
// an existing review always stay editable. Rating/comment bounds mirror
// postEventReview.ts's DB constraints (event_review_rating_check,
// event_review_comment_check).
export async function updateEventReview(formData: UpdateEventReviewInput) {
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
    .from("event_review")
    .update({
      rating,
      title: formattedTitle,
      comment: comment ?? null,
    })
    .eq("id", reviewId)
    .eq("reviewer_id", user.id)
    .select("id");

  if (updateError) {
    console.log(`Error updating event review: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!updated || updated.length === 0) {
    return { status: 404, message: "Review not found" };
  }

  // The update above already proved reviewId belongs to this user (it was
  // scoped by .eq("reviewer_id", user.id)), so these photo operations don't
  // need their own separate ownership check -- they're additionally scoped
  // by event_review_id as defense-in-depth against a tampered id list.
  if (removedPhotoIds?.length) {
    await supabase
      .from("event_review_photo")
      .delete()
      .eq("event_review_id", reviewId)
      .in("id", removedPhotoIds);
  }

  if (newPhotos?.length) {
    const { count } = await supabase
      .from("event_review_photo")
      .select("id", { count: "exact", head: true })
      .eq("event_review_id", reviewId);

    await insertReviewPhotos(
      supabase,
      "event_review_photo",
      "event_review_id",
      reviewId,
      `event_review_photos/${user.id}/`,
      newPhotos,
      count ?? 0,
    );
  }

  return { status: 200, message: "Review updated successfully!" };
}
