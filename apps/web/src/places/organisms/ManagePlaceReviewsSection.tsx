"use client";

import { respondToPlaceReview } from "@/actions/respondToPlaceReview";
import StarRatingDisplay from "@/components/atoms/Rating";
import ReviewPhotoGrid from "@/components/molecules/ReviewPhotoGrid";
import InfiniteList from "@/components/organisms/InfiniteList";
import { useToast } from "@/hooks/useToast";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getRelativeTime } from "@/utils/dateFormatter";
import type { PaginatedResult } from "@abonten/types/pagination";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";

// No generated Supabase types exist in this repo (see PROJECT.md) --
// matches getPlaceReviews.ts's own biome-ignore'd `any` return type, same
// convention PlaceReviewsSection.tsx already uses for this joined row shape.
// biome-ignore lint/suspicious/noExplicitAny: see above
type PlaceReviewRow = any;

type ManagePlaceReviewsSectionProps = {
  placeId: string;
  initialPage: PaginatedResult<PlaceReviewRow>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<PlaceReviewRow>>;
};

// Owner-facing counterpart to PlaceReviewsSection.tsx (the public detail
// page's read-only reviews list): same layout and the same "Response from
// owner" styling convention, plus a Respond action per review that has no
// owner_response yet.
export default function ManagePlaceReviewsSection({
  placeId,
  initialPage,
  fetchPage,
}: ManagePlaceReviewsSectionProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [respondingToId, setRespondingToId] = useState<string | null>(null);
  // Repopulates the response textarea with what the owner typed if the
  // optimistic post below has to roll back — otherwise reopening the form
  // after a failure would silently drop their draft.
  const [draftText, setDraftText] = useState<{
    reviewId: string;
    text: string;
  } | null>(null);

  const reviewsQueryKey = ["manage-place-reviews", placeId];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: reviewsQueryKey });

  const replyMutation = useMutation({
    mutationFn: ({ reviewId, text }: { reviewId: string; text: string }) =>
      respondToPlaceReview(reviewId, text),

    // The response is a short, low-stakes text field an owner already chose
    // to submit, so it appears in place immediately; if the server rejects
    // it, the cache rolls back and the form reopens with the same text so
    // nothing typed is lost.
    onMutate: async ({ reviewId, text }) => {
      setRespondingToId(null);
      setDraftText(null);

      await queryClient.cancelQueries({ queryKey: reviewsQueryKey });

      const previousReviews =
        queryClient.getQueryData<InfiniteData<PaginatedResult<PlaceReviewRow>>>(
          reviewsQueryKey,
        );

      queryClient.setQueryData<InfiniteData<PaginatedResult<PlaceReviewRow>>>(
        reviewsQueryKey,
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              data: page.data.map((row) =>
                row.id === reviewId ? { ...row, owner_response: text } : row,
              ),
            })),
          },
      );

      return { previousReviews };
    },

    onSuccess: (response, vars, context) => {
      if (response.status === 200) {
        toast.success("✅ Response posted successfully!");
        invalidate();
      } else {
        if (context?.previousReviews) {
          queryClient.setQueryData(reviewsQueryKey, context.previousReviews);
        }
        toast.error(`❌ ${response.message}`);
        setDraftText(vars);
        setRespondingToId(vars.reviewId);
      }
    },

    onError: (_error, vars, context) => {
      if (context?.previousReviews) {
        queryClient.setQueryData(reviewsQueryKey, context.previousReviews);
      }
      toast.error("❌ Something went wrong. Please try again.");
      setDraftText(vars);
      setRespondingToId(vars.reviewId);
    },
  });

  return (
    <div className="space-y-4">
      <InfiniteList<PlaceReviewRow>
        queryKey={reviewsQueryKey}
        initialPage={initialPage}
        fetchPage={fetchPage}
        listClassName="flex flex-col gap-6"
        emptyState={
          <p className="text-muted-foreground text-sm py-4">No reviews yet.</p>
        }
        renderItem={(review: PlaceReviewRow) => (
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

              <StarRatingDisplay rating={review.rating} />
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

            <ReviewPhotoGrid photos={review.place_review_photo} />

            {review.owner_response ? (
              <div className="mt-3 ml-4 md:ml-8 p-3 rounded-lg bg-muted border-l-4 border-primary">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                  Response from owner
                </p>
                <p className="text-sm text-foreground">
                  {review.owner_response}
                </p>
              </div>
            ) : respondingToId === review.id ? (
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
              <button
                type="button"
                onClick={() => setRespondingToId(review.id)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Respond
              </button>
            )}
          </li>
        )}
      />
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
        placeholder="Write a response to this review..."
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
          {isSubmitting ? "Posting..." : "Post response"}
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
