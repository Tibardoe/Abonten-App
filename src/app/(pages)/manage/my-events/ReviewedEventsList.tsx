"use client";

import { deleteEventReview } from "@/actions/deleteEventReview";
import StarRatingDisplay from "@/components/atoms/Rating";
import ReviewPhotoGrid from "@/components/molecules/ReviewPhotoGrid";
import InfiniteList from "@/components/organisms/InfiniteList";
import EventReviewModal from "@/events/organisms/EventReviewModal";
import type { PaginatedResult } from "@/types/pagination";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getRelativeTime } from "@/utils/dateFormatter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const noReviewsState = (
  <p className="text-center text-muted-foreground text-sm py-10">
    You haven&apos;t reviewed any events yet.
  </p>
);

// No generated Supabase types exist in this repo (see PROJECT.md) — matches
// getUserEventReviews.ts's own biome-ignore'd `any` return type.
// biome-ignore lint/suspicious/noExplicitAny: see above
type EventReviewRow = any;

function ReviewedEventCard({ review }: { review: EventReviewRow }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Invalidates every cache this review could appear in — this list, and
  // (in case the viewer also has the Event Details page open in the same
  // session) the eligibility/rating/list queries EventReviewsSection.tsx
  // and AddEventReviewButton.tsx key off of for this same event.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["user-event-reviews"] });
    queryClient.invalidateQueries({ queryKey: ["events-awaiting-review"] });
    queryClient.invalidateQueries({ queryKey: ["attending-events-counts"] });
    queryClient.invalidateQueries({
      queryKey: ["event-reviews", review.event_id],
    });
    queryClient.invalidateQueries({
      queryKey: ["event-rating", review.event_id],
    });
    queryClient.invalidateQueries({
      queryKey: ["event-review-eligibility", review.event_id],
    });
  };

  const { mutate: deleteReview, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteEventReview(review.id),
    onSuccess: (response) => {
      if (response.status === 200) {
        setShowDeleteConfirm(false);
        invalidate();
      }
    },
  });

  return (
    <div className="bg-card text-card-foreground rounded-2xl shadow-md overflow-hidden border border-border">
      <div className="relative h-40 w-full">
        <Image
          src={buildCloudinaryUrl(
            review.event.flyer_public_id,
            review.event.flyer_version,
            { width: 400, height: 160 },
          )}
          alt={review.event.title}
          fill
          className="object-cover"
        />
      </div>

      <div className="p-4 space-y-2">
        <Link
          href={`/events/${review.event.event_code}#reviews`}
          className="font-semibold block"
        >
          {review.event.title}
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

        <ReviewPhotoGrid photos={review.event_review_photo} />

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
        <EventReviewModal
          eventId={review.event_id}
          handleShowReviewModal={setIsEditing}
          existingReview={{
            id: review.id,
            rating: review.rating,
            title: review.title,
            comment: review.comment,
            event_review_photo: review.event_review_photo,
          }}
          onReviewSubmitted={invalidate}
        />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay/50 p-4">
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

export default function ReviewedEventsList({
  initialPage,
  fetchPage,
}: {
  initialPage: PaginatedResult<EventReviewRow> | null;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<EventReviewRow>>;
}) {
  return (
    <InfiniteList<EventReviewRow>
      queryKey={["user-event-reviews"]}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={noReviewsState}
      listElement="div"
      listClassName="grid md:grid-cols-3 gap-6"
      renderItem={(review) => (
        <ReviewedEventCard key={review.id} review={review} />
      )}
    />
  );
}
