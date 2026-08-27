"use client";

import { deletePlaceReview } from "@/actions/deletePlaceReview";
import StarRatingDisplay from "@/components/atoms/Rating";
import ReviewPhotoGrid from "@/components/molecules/ReviewPhotoGrid";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useToast } from "@/hooks/useToast";
import PlaceReviewModal from "@/places/organisms/PlaceReviewModal";
import type { PaginatedResult } from "@/types/pagination";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getRelativeTime } from "@/utils/dateFormatter";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const noReviewsState = (
  <p className="text-center text-muted-foreground text-sm py-10">
    You haven&apos;t reviewed any places yet.
  </p>
);

// No generated Supabase types exist in this repo (see PROJECT.md) — matches
// getUserPlaceReviews.ts's own biome-ignore'd `any` return type.
// biome-ignore lint/suspicious/noExplicitAny: see above
type PlaceReviewRow = any;

// Mirrors ReviewedEventsList.tsx exactly, one content type over (place_review
// instead of event_review, updatePlaceReview/deletePlaceReview instead of
// their event counterparts).
const REVIEWED_PLACES_QUERY_KEY = ["user-place-reviews"];

function ReviewedPlaceCard({ review }: { review: PlaceReviewRow }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: REVIEWED_PLACES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["attending-events-counts"] });
    queryClient.invalidateQueries({
      queryKey: ["place-reviews", review.place_id],
    });
    queryClient.invalidateQueries({
      queryKey: ["place-rating", review.place_id],
    });
    queryClient.invalidateQueries({
      queryKey: ["own-place-review", review.place_id],
    });
  };

  const { mutate: deleteReview, isPending: isDeleting } = useMutation({
    mutationFn: () => deletePlaceReview(review.id),

    onMutate: async () => {
      setShowDeleteConfirm(false);

      await queryClient.cancelQueries({ queryKey: REVIEWED_PLACES_QUERY_KEY });

      const previousReviews = queryClient.getQueryData<
        InfiniteData<PaginatedResult<PlaceReviewRow>>
      >(REVIEWED_PLACES_QUERY_KEY);

      queryClient.setQueryData<InfiniteData<PaginatedResult<PlaceReviewRow>>>(
        REVIEWED_PLACES_QUERY_KEY,
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.filter((row) => row.id !== review.id),
            })),
          },
      );

      return { previousReviews };
    },

    onSuccess: (response, _vars, context) => {
      if (response.status === 200) {
        invalidate();
      } else {
        if (context?.previousReviews) {
          queryClient.setQueryData(
            REVIEWED_PLACES_QUERY_KEY,
            context.previousReviews,
          );
        }
        toast.error(response.message ?? "Couldn't delete this review.");
      }
    },

    onError: (_error, _vars, context) => {
      if (context?.previousReviews) {
        queryClient.setQueryData(
          REVIEWED_PLACES_QUERY_KEY,
          context.previousReviews,
        );
      }
      toast.error("Couldn't delete this review. Please try again.");
    },
  });

  return (
    <div className="bg-card text-card-foreground rounded-2xl shadow-md overflow-hidden border border-border">
      <div className="relative h-40 w-full">
        <Image
          src={buildCloudinaryUrl(
            review.place.cover_public_id,
            review.place.cover_version,
            { width: 400, height: 160 },
          )}
          alt={review.place.name}
          fill
          className="object-cover"
        />
      </div>

      <div className="p-4 space-y-2">
        <Link
          href={`/places/${review.place.slug}#reviews`}
          className="font-semibold block"
        >
          {review.place.name}
        </Link>

        <div className="flex items-center justify-between">
          <StarRatingDisplay rating={review.rating} />
          <span className="text-xs text-muted-foreground">
            {getRelativeTime(review.created_at)}
          </span>
        </div>

        {review.title && (
          <p className="font-medium text-sm text-card-foreground">
            {review.title}
          </p>
        )}

        {review.comment && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {review.comment}
          </p>
        )}

        <ReviewPhotoGrid photos={review.place_review_photo} />

        <div className="flex gap-4 pt-1">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-sm text-primary hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-destructive hover:underline"
          >
            Delete
          </button>
        </div>
      </div>

      {isEditing && (
        <PlaceReviewModal
          placeId={review.place_id}
          handleShowReviewModal={setIsEditing}
          existingReview={{
            id: review.id,
            rating: review.rating,
            title: review.title,
            comment: review.comment,
            place_review_photo: review.place_review_photo,
          }}
          onReviewSubmitted={invalidate}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4">
          <div className="bg-card text-card-foreground rounded-lg p-6 w-full max-w-sm space-y-4 shadow-lg">
            <p className="font-medium">Delete your review?</p>
            <p className="text-sm text-muted-foreground">
              This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3 py-1.5 rounded-md text-sm border border-border hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => deleteReview()}
                className="px-3 py-1.5 rounded-md text-sm bg-destructive text-destructive-foreground disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewedPlacesList({
  initialPage,
  fetchPage,
}: {
  initialPage: PaginatedResult<PlaceReviewRow> | null;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<PlaceReviewRow>>;
}) {
  return (
    <InfiniteList<PlaceReviewRow>
      queryKey={["user-place-reviews"]}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={noReviewsState}
      listElement="div"
      listClassName="grid md:grid-cols-3 gap-6"
      renderItem={(review) => (
        <ReviewedPlaceCard key={review.id} review={review} />
      )}
    />
  );
}
