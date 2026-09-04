"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  type ReviewPhotoInput,
  insertReviewPhotos,
} from "@abonten/services/reviews/insertReviewPhotos";
import { checkRateLimit } from "@abonten/services/security/rateLimit";

// Postgres error code for a unique-constraint violation.
const UNIQUE_VIOLATION = "23505";

// No attendance gate here (unlike postEventReview.ts) -- any authenticated
// user can review any published place, so the one-review-per-place UNIQUE
// constraint alone doesn't stop spamming many different places in a burst.
const MAX_REVIEWS_PER_HOUR = 10;

type PostPlaceReviewInput = {
  placeId: string;
  rating: number;
  title?: string;
  comment?: string;
  // Already uploaded to Cloudinary (see getPlaceReviewPhotoUploadSignature.ts
  // + ReviewPhotoPicker.tsx) before this action ever runs -- only their
  // metadata is passed here, never raw image bytes.
  photos?: ReviewPhotoInput[];
};

/**
 * Unlike postReview.ts (event organizer reviews), there is no
 * attendance-gate in Phase 1 — any authenticated user may review any
 * published place. The DB's UNIQUE(place_id, reviewer_id) constraint
 * (place_review_unique_reviewer) is what actually enforces "one review per
 * user per place"; a duplicate attempt surfaces here as a friendly 409.
 */
export async function postPlaceReview(formData: PostPlaceReviewInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const allowed = await checkRateLimit(
    `place-review-post:${user.id}`,
    MAX_REVIEWS_PER_HOUR,
    3600,
  );

  if (!allowed) {
    return {
      status: 429,
      message: "Too many reviews posted recently. Please try again later.",
    };
  }

  const { placeId, rating, title, comment, photos } = formData;

  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("owner_id")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError) {
    return {
      status: 500,
      message: `Error fetching place: ${placeError.message}`,
    };
  }

  if (!place) {
    return { status: 404, message: "Place not found" };
  }

  if (place.owner_id === user.id) {
    return { status: 400, message: "You cannot review your own place" };
  }

  const formattedTitle = title
    ? title
        .split(" ")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
        )
        .join(" ")
    : null;

  const { data: review, error: insertError } = await supabase
    .from("place_review")
    .insert({
      place_id: placeId,
      reviewer_id: user.id,
      rating,
      title: formattedTitle,
      comment: comment ?? null,
      status: "approved",
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      return { status: 409, message: "You've already reviewed this place." };
    }

    logger.error(`Error inserting place review: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await insertReviewPhotos(
    supabase,
    "place_review_photo",
    "place_review_id",
    review.id,
    `place_review_photos/${user.id}/`,
    photos,
  );

  return { status: 200, message: "Review posted successfully!" };
}
