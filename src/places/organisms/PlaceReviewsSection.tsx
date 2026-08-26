"use client";

import ReviewListItem from "@/components/molecules/ReviewListItem";
import ReviewRowSkeleton from "@/components/molecules/ReviewRowSkeleton";
import ReviewsSectionHeader from "@/components/molecules/ReviewsSectionHeader";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import AddPlaceReviewButton from "../molecules/AddPlaceReviewButton";

// No generated Supabase types exist in this repo (see PROJECT.md) --
// matches getPlaceReviews.ts's own biome-ignore'd `any` return type for this
// joined place_review + user_info row shape.
// biome-ignore lint/suspicious/noExplicitAny: see above
type PlaceReviewRow = any;

type PlaceReviewsSectionProps = {
  placeId: string;
  ownerId: string;
  avgRating: number;
  reviewCount: number;
  initialPage: PaginatedResult<PlaceReviewRow>;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<PlaceReviewRow>>;
};

export default function PlaceReviewsSection({
  placeId,
  ownerId,
  avgRating,
  reviewCount,
  initialPage,
  fetchPage,
}: PlaceReviewsSectionProps) {
  return (
    <div
      id="reviews"
      className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm space-y-4 scroll-mt-20"
    >
      <ReviewsSectionHeader
        avgRating={avgRating}
        reviewCount={reviewCount}
        addReviewButton={
          <AddPlaceReviewButton placeId={placeId} ownerId={ownerId} />
        }
      />

      <InfiniteList<PlaceReviewRow>
        queryKey={["place-reviews", placeId]}
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
        renderItem={(review: PlaceReviewRow) => (
          <ReviewListItem
            key={review.id}
            avatarPublicId={review.user_info?.avatar_public_id}
            avatarVersion={review.user_info?.avatar_version}
            username={review.user_info?.username}
            createdAt={review.created_at}
            rating={review.rating}
            title={review.title}
            comment={review.comment}
            photos={review.place_review_photo}
            responseLabel="Response from owner"
            responseText={review.owner_response}
          />
        )}
      />
    </div>
  );
}
