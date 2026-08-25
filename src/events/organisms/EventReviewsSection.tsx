"use client";

import { respondToEventReview } from "@/actions/respondToEventReview";
import Notification from "@/components/atoms/Notification";
import StarRatingDisplay from "@/components/atoms/Rating";
import ReviewPhotoGrid from "@/components/molecules/ReviewPhotoGrid";
import ReviewRowSkeleton from "@/components/molecules/ReviewRowSkeleton";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import type { Occurrence } from "@/types/occurrenceType";
import type { PaginatedResult } from "@/types/pagination";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getRelativeTime } from "@/utils/dateFormatter";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";
import AddEventReviewButton from "../molecules/AddEventReviewButton";

// No generated Supabase types exist in this repo (see PROJECT.md) --
// matches getEventReviews.ts's own biome-ignore'd `any` return type.
// biome-ignore lint/suspicious/noExplicitAny: see above
type EventReviewRow = any;

type EventReviewsSectionProps = {
  eventId: string;
  organizerId: string;
  eventStatus: string;
  startsAt: string | null;
  endsAt: string | null;
  occurrences: Occurrence[] | null;
  avgRating: number;
  reviewCount: number;
  initialPage: PaginatedResult<EventReviewRow>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<EventReviewRow>>;
};

// Combines the public review list AND the organizer's reply affordance in
// one component -- unlike Places (which has a separate manage/places/[id]
// dashboard with its own ManagePlaceReviewsSection), there is no per-event
// manage page for events, so "Reply" simply appears inline for whichever
// viewer happens to be this event's organizer, exactly like
// ManagePlaceReviewsSection's RespondForm but gated by an isOrganizer check
// instead of living on a separate route. respondToEventReview.ts is the
// real authorization boundary regardless of what this component shows.
export default function EventReviewsSection({
  eventId,
  organizerId,
  eventStatus,
  startsAt,
  endsAt,
  occurrences,
  avgRating,
  reviewCount,
  initialPage,
  fetchPage,
}: EventReviewsSectionProps) {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { message: notification, showMessage } = useTimedMessage(3000);
  const [respondingToId, setRespondingToId] = useState<string | null>(null);
  // Repopulates the reply textarea with what the organizer typed if the
  // optimistic post below has to roll back — otherwise reopening the form
  // after a failure would silently drop their draft.
  const [draftText, setDraftText] = useState<{
    reviewId: string;
    text: string;
  } | null>(null);

  const isOrganizer = user?.id === organizerId;

  const reviewsQueryKey = ["event-reviews", eventId];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: reviewsQueryKey });

  const replyMutation = useMutation({
    mutationFn: ({ reviewId, text }: { reviewId: string; text: string }) =>
      respondToEventReview(reviewId, text),

    // The reply is a short, low-stakes text field an organizer already
    // chose to submit, so it appears in place immediately; if the server
    // rejects it, the cache rolls back and the form reopens with the same
    // text so nothing typed is lost.
    onMutate: async ({ reviewId, text }) => {
      setRespondingToId(null);
      setDraftText(null);

      await queryClient.cancelQueries({ queryKey: reviewsQueryKey });

      const previousReviews =
        queryClient.getQueryData<InfiniteData<PaginatedResult<EventReviewRow>>>(
          reviewsQueryKey,
        );

      queryClient.setQueryData<InfiniteData<PaginatedResult<EventReviewRow>>>(
        reviewsQueryKey,
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((row) =>
                row.id === reviewId
                  ? { ...row, organizer_response: text }
                  : row,
              ),
            })),
          },
      );

      return { previousReviews };
    },

    onSuccess: (response, vars, context) => {
      if (response.status === 200) {
        showMessage("✅ Reply posted successfully!");
        invalidate();
      } else {
        if (context?.previousReviews) {
          queryClient.setQueryData(reviewsQueryKey, context.previousReviews);
        }
        showMessage(`❌ ${response.message}`);
        setDraftText(vars);
        setRespondingToId(vars.reviewId);
      }
    },

    onError: (_error, vars, context) => {
      if (context?.previousReviews) {
        queryClient.setQueryData(reviewsQueryKey, context.previousReviews);
      }
      showMessage("❌ Something went wrong. Please try again.");
      setDraftText(vars);
      setRespondingToId(vars.reviewId);
    },
  });

  return (
    <div
      id="reviews"
      className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm space-y-4 scroll-mt-20"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-medium text-card-foreground">
            Reviews
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <StarRatingDisplay rating={avgRating} />
            <span className="text-sm text-muted-foreground">
              {avgRating.toFixed(1)} ({reviewCount}{" "}
              {reviewCount === 1 ? "review" : "reviews"})
            </span>
          </div>
        </div>

        <AddEventReviewButton
          eventId={eventId}
          organizerId={organizerId}
          eventStatus={eventStatus}
          startsAt={startsAt}
          endsAt={endsAt}
          occurrences={occurrences}
        />
      </div>

      <InfiniteList<EventReviewRow>
        queryKey={reviewsQueryKey}
        initialPage={initialPage}
        fetchPage={fetchPage}
        listClassName="flex flex-col gap-6"
        loadingSkeleton={
          <ul className="flex flex-col gap-6">
            {Array.from({ length: 3 }, (_, i) => (
              <ReviewRowSkeleton key={i.toLocaleString()} />
            ))}
          </ul>
        }
        emptyState={
          <p className="text-muted-foreground text-sm py-4">No reviews yet.</p>
        }
        renderItem={(review: EventReviewRow) => (
          <li
            key={review.id}
            className="border-b border-border pb-6 last:border-0 last:pb-0"
          >
            <div className="flex items-center gap-3">
              {review.user_info?.avatar_public_id ? (
                <Image
                  src={buildCloudinaryUrl(
                    review.user_info.avatar_public_id,
                    review.user_info.avatar_version,
                    { width: 40, height: 40 },
                  )}
                  alt={review.user_info?.username ?? "Reviewer"}
                  width={40}
                  height={40}
                  className="rounded-full border border-border"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted" />
              )}

              <div className="flex-1 min-w-0">
                <p className="font-medium text-card-foreground truncate">
                  {review.user_info?.username ?? "Anonymous"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getRelativeTime(review.created_at)}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1">
                <StarRatingDisplay rating={review.rating} />
                {review.is_verified_attendee && (
                  <span className="text-[11px] font-medium text-success whitespace-nowrap">
                    ✓ Verified Attendee
                  </span>
                )}
              </div>
            </div>

            {review.title && (
              <h4 className="font-medium text-card-foreground mt-2">
                {review.title}
              </h4>
            )}

            {review.comment && (
              <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                {review.comment}
              </p>
            )}

            <ReviewPhotoGrid photos={review.event_review_photo} />

            {review.organizer_response ? (
              <div className="mt-3 ml-4 md:ml-8 p-3 rounded-lg bg-muted border-l-4 border-primary">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                  Organizer reply
                </p>
                <p className="text-sm text-foreground">
                  {review.organizer_response}
                </p>
              </div>
            ) : isOrganizer && respondingToId === review.id ? (
              <RespondForm
                initialText={
                  draftText && draftText.reviewId === review.id
                    ? draftText.text
                    : ""
                }
                isSubmitting={
                  replyMutation.isPending &&
                  replyMutation.variables?.reviewId === review.id
                }
                onCancel={() => {
                  setRespondingToId(null);
                  setDraftText(null);
                }}
                onSubmit={(text) =>
                  replyMutation.mutate({ reviewId: review.id, text })
                }
              />
            ) : (
              isOrganizer && (
                <button
                  type="button"
                  onClick={() => setRespondingToId(review.id)}
                  className="mt-2 text-sm text-primary hover:underline"
                >
                  Reply
                </button>
              )
            )}
          </li>
        )}
      />

      <Notification notification={notification} />
    </div>
  );
}

function RespondForm({
  initialText,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  initialText: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [response, setResponse] = useState(initialText);

  const handleSubmit = () => {
    const trimmed = response.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="mt-3 ml-4 md:ml-8 space-y-2">
      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Write a reply to this review..."
        className="w-full rounded-md border border-input bg-background p-2 text-sm"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isSubmitting || !response.trim()}
          onClick={handleSubmit}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isSubmitting ? "Posting..." : "Post reply"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="border border-border px-3 py-1.5 rounded-md text-sm hover:bg-accent transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
