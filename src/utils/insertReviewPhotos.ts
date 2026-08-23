import type { createClient } from "@/config/supabase/server";
import { MAX_REVIEW_PHOTOS } from "./uploadLimits";

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
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "place_review_photo" | "event_review_photo",
  reviewIdColumn: "place_review_id" | "event_review_id",
  reviewId: string,
  folderPrefix: string,
  photos: ReviewPhotoInput[] | undefined,
): Promise<void> {
  if (!photos?.length) return;

  const validPhotos = photos
    .filter((photo) => photo.publicId.startsWith(folderPrefix))
    .slice(0, MAX_REVIEW_PHOTOS);

  if (!validPhotos.length) return;

  const rows = validPhotos.map((photo, index) => ({
    [reviewIdColumn]: reviewId,
    public_id: photo.publicId,
    version: photo.version,
    position: index,
  }));

  const { error } = await supabase.from(table).insert(rows);

  if (error) {
    console.log(`Error attaching photos to ${table}: ${error.message}`);
  }
}
