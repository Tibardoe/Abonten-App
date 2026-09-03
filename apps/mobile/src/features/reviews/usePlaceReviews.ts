import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { MAX_REVIEW_PHOTOS } from "@abonten/core/uploadLimits";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewPhotoRow } from "./useEventReviews";

// Native echoes of the web place-review actions (getOwnPlaceReview /
// postPlaceReview / updatePlaceReview / deletePlaceReview). `place_review`
// has reviewer-scoped RLS (place_review_reviewer_insert/update/delete/select)
// and `place_review_photo` has place_review_photo_reviewer_all, so the whole
// consumer flow runs straight from the client — no /api/mobile endpoint,
// same shape as the event-review flow in useEventReviews.ts. Every rule the
// web server actions enforce is re-checked here, and the DB's
// UNIQUE(place_id, reviewer_id) (place_review_unique_reviewer) is the final
// backstop.

export type PlaceReviewPhotoInput = { publicId: string; version: string };

export type OwnPlaceReview = {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  place_review_photo?: ReviewPhotoRow[] | null;
};

export type PlaceReviewEligibility =
  | { canReview: false; reason: "signed_out" | "owner" }
  | { canReview: false; reason: "has_review"; ownReview: OwnPlaceReview }
  | { canReview: true };

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Native echo of insertReviewPhotos.ts: once the review row exists, attach
// the caller's already-uploaded photos. A publicId outside the caller's own
// signed folder means tampered metadata — silently dropped. `startPosition`
// lets an edit append new photos after the ones the user kept.
async function attachPlaceReviewPhotos(
  userId: string,
  reviewId: string,
  photos: PlaceReviewPhotoInput[] | undefined,
  startPosition = 0,
): Promise<void> {
  if (!photos?.length) return;
  const prefix = `place_review_photos/${userId}/`;
  const rows = photos
    .filter((p) => p.publicId.startsWith(prefix))
    .slice(0, MAX_REVIEW_PHOTOS)
    .map((p, index) => ({
      place_review_id: reviewId,
      public_id: p.publicId,
      version: p.version,
      position: startPosition + index,
    }));
  if (!rows.length) return;
  await supabase.from("place_review_photo").insert(rows);
}

async function computeEligibility(
  userId: string | undefined,
  placeId: string,
  ownerId: string | null | undefined,
): Promise<PlaceReviewEligibility> {
  if (!userId) return { canReview: false, reason: "signed_out" };
  if (ownerId && userId === ownerId)
    return { canReview: false, reason: "owner" };

  const { data: own } = await supabase
    .from("place_review")
    .select(
      "id, rating, title, comment, place_review_photo(id, public_id, version, position)",
    )
    .eq("place_id", placeId)
    .eq("reviewer_id", userId)
    .maybeSingle();

  if (own) {
    return {
      canReview: false,
      reason: "has_review",
      ownReview: own as OwnPlaceReview,
    };
  }

  return { canReview: true };
}

export function usePlaceReviewEligibility(
  placeId: string | undefined,
  ownerId: string | null | undefined,
) {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["mobile", "place-review-eligibility", placeId, userId],
    enabled: !!placeId,
    queryFn: () => computeEligibility(userId, placeId as string, ownerId),
  });
}

function useInvalidateAfterReview(placeId: string | undefined) {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id;
  return () => {
    qc.invalidateQueries({ queryKey: ["mobile", "place-reviews", placeId] });
    qc.invalidateQueries({ queryKey: ["mobile", "place", placeId] });
    qc.invalidateQueries({
      queryKey: ["mobile", "place-review-eligibility", placeId, userId],
    });
    qc.invalidateQueries({ queryKey: ["profile", "place-reviews", userId] });
    // PlaceCard on the Explore / Around You feeds shows avg_rating +
    // review_count straight from get_filtered_places / get_nearby_places —
    // a new/edited/deleted review moves both, so refresh those lists.
    qc.invalidateQueries({ queryKey: ["discovery", "places"] });
    qc.invalidateQueries({ queryKey: ["explore"] });
  };
}

export function usePostPlaceReview(placeId: string | undefined) {
  const { session } = useSession();
  const userId = session?.user.id;
  const invalidate = useInvalidateAfterReview(placeId);

  return useMutation({
    mutationFn: async (input: {
      rating: number;
      title?: string;
      comment?: string;
      photos?: PlaceReviewPhotoInput[];
    }) => {
      if (!userId) throw new Error("Not signed in");
      if (!placeId) throw new Error("Missing place");
      const { data: review, error } = await supabase
        .from("place_review")
        .insert({
          place_id: placeId,
          reviewer_id: userId,
          rating: input.rating,
          title: input.title ? titleCase(input.title) : null,
          comment: input.comment?.trim() ? input.comment.trim() : null,
          status: "approved",
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505")
          throw new Error("You've already reviewed this place.");
        throw error;
      }
      await attachPlaceReviewPhotos(userId, review.id, input.photos);
    },
    onSuccess: invalidate,
  });
}

export function useUpdatePlaceReview(placeId: string | undefined) {
  const { session } = useSession();
  const userId = session?.user.id;
  const invalidate = useInvalidateAfterReview(placeId);

  return useMutation({
    mutationFn: async (input: {
      reviewId: string;
      rating: number;
      title?: string;
      comment?: string;
      removedPhotoIds?: string[];
      newPhotos?: PlaceReviewPhotoInput[];
      keptPhotoCount: number;
    }) => {
      if (!userId) throw new Error("Not signed in");
      const { data: updated, error } = await supabase
        .from("place_review")
        .update({
          rating: input.rating,
          title: input.title ? titleCase(input.title) : null,
          comment: input.comment?.trim() ? input.comment.trim() : null,
        })
        .eq("id", input.reviewId)
        .eq("reviewer_id", userId)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error("Review not found");

      if (input.removedPhotoIds?.length) {
        await supabase
          .from("place_review_photo")
          .delete()
          .eq("place_review_id", input.reviewId)
          .in("id", input.removedPhotoIds);
      }
      await attachPlaceReviewPhotos(
        userId,
        input.reviewId,
        input.newPhotos,
        input.keptPhotoCount,
      );
    },
    onSuccess: invalidate,
  });
}

export function useDeletePlaceReview(placeId: string | undefined) {
  const { session } = useSession();
  const userId = session?.user.id;
  const invalidate = useInvalidateAfterReview(placeId);

  return useMutation({
    mutationFn: async (reviewId: string) => {
      if (!userId) throw new Error("Not signed in");
      const { data: deleted, error } = await supabase
        .from("place_review")
        .delete()
        .eq("id", reviewId)
        .eq("reviewer_id", userId)
        .select("id");
      if (error) throw error;
      if (!deleted || deleted.length === 0) throw new Error("Review not found");
    },
    onSuccess: invalidate,
  });
}
