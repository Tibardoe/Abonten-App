import StarRatingDisplay from "@/components/atoms/Rating";
import type { ReactNode } from "react";

type ReviewsSectionHeaderProps = {
  avgRating: number;
  reviewCount: number;
  addReviewButton: ReactNode;
};

// Shared "Reviews" heading + rating summary row for EventReviewsSection and
// PlaceReviewsSection -- previously identical markup duplicated in both.
export default function ReviewsSectionHeader({
  avgRating,
  reviewCount,
  addReviewButton,
}: ReviewsSectionHeaderProps) {
  return (
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

      {addReviewButton}
    </div>
  );
}
