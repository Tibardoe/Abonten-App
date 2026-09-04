import { logger } from "@abonten/core/logger";
import { MAX_REVIEW_PHOTOS } from "@abonten/core/uploadLimits";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReviewPhotoInput = { publicId: string; version: string };

// Shared by postPlaceReview.ts/postEventReview.ts: once a review row exists
// (so its id is known and its reviewer_id is guaranteed to be the caller),
// attach whichever of the caller's already-uploaded photos are legitimate.
// A publicId outside the caller's own signed folder (see
// getPlaceReviewPhotoUploadSignature.ts/getEventReviewPhotoUploadSignature.ts)
// means the metadata was tampered with client-side, since a real upload
// could never land anywhere else -- such an entry is silently dropped
// rather than failing the whole review, since the review itself is already
// successfully created by the time this runs. Anything past
// MAX_REVIEW_PHOTOS is dropped too, as defense-in-depth against a tampered
// request (the picker UI already enforces this client-side).
export async function insertReviewPhotos(
  supabase: SupabaseClient<Database>,
  table: "place_review_photo" | "event_review_photo",
  reviewIdColumn: "place_review_id" | "event_review_id",
  reviewId: string,
  folderPrefix: string,
  photos: ReviewPhotoInput[] | undefined,
  // Where numbering starts -- 0 for a brand-new review (postEventReview.ts/
  // postPlaceReview.ts), or the count of photos already kept on an existing
  // review (updateEventReview.ts/updatePlaceReview.ts), so newly added
  // photos sort after the ones the user chose to keep instead of colliding
  // with their positions.
  startPosition = 0,
): Promise<void> {
  if (!photos?.length) return;

  const validPhotos = photos
    .filter((photo) => photo.publicId.startsWith(folderPrefix))
    .slice(0, MAX_REVIEW_PHOTOS);

  if (!validPhotos.length) return;

  const photoFields = validPhotos.map((photo, index) => ({
    public_id: photo.publicId,
    version: photo.version,
    position: startPosition + index,
  }));

  // Branched (rather than a single .from(table)/computed-key insert) so
  // each arm resolves a single, literal table and a literal id-column key
  // -- the typed client can't narrow an insert built from a *union* of
  // table name and a computed (reviewIdColumn) property name varying
  // together, even though each individual combination here is perfectly
  // ordinary. See useFavorites.ts (mobile) for the same reasoning.
  const { error } =
    table === "event_review_photo"
      ? await supabase
          .from("event_review_photo")
          .insert(photoFields.map((f) => ({ ...f, event_review_id: reviewId })))
      : await supabase
          .from("place_review_photo")
          .insert(
            photoFields.map((f) => ({ ...f, place_review_id: reviewId })),
          );

  if (error) {
    logger.error(`Error attaching photos to ${table}: ${error.message}`);
  }
}
