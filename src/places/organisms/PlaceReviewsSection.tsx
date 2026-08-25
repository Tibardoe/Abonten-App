"use client";

import StarRatingDisplay from "@/components/atoms/Rating";
import ReviewPhotoGrid from "@/components/molecules/ReviewPhotoGrid";
import ReviewRowSkeleton from "@/components/molecules/ReviewRowSkeleton";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getRelativeTime } from "@/utils/dateFormatter";
import Image from "next/image";
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

        <AddPlaceReviewButton placeId={placeId} ownerId={ownerId} />
      </div>

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

            {review.owner_response && (
              <div className="mt-3 ml-4 md:ml-8 p-3 rounded-lg bg-muted border-l-4 border-primary">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                  Response from owner
                </p>
                <p className="text-sm text-foreground">
                  {review.owner_response}
                </p>
              </div>
            )}
          </li>
        )}
      />
    </div>
  );
}
