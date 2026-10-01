"use client";

import StarRatingDisplay from "@/components/atoms/Rating";
import { roundRating } from "@abonten/core/ratings";
import {
  type ReviewRatingFilter,
  type ReviewSummary,
  ratingShares,
} from "@abonten/core/reviews/reviewList";
import { useFormatter, useTranslations } from "next-intl";

const LEVELS = [5, 4, 3, 2, 1] as const;

// The overall picture before the individual reviews: the average, how many
// reviews it rests on, and the split across 1–5 stars. With `onSelect`, each
// row is also the shortcut to that star filter (clicking it again clears it).
export default function ReviewSummaryBars({
  summary,
  selected,
  onSelect,
}: {
  summary: ReviewSummary;
  selected?: ReviewRatingFilter;
  onSelect?: (rating: ReviewRatingFilter) => void;
}) {
  const t = useTranslations("reviews");
  const format = useFormatter();

  const shares = ratingShares(summary);
  const average = roundRating(summary.average);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-1 sm:min-w-[120px]">
        <span className="text-4xl font-bold leading-none">
          {average.toFixed(1)}
        </span>
        <div className="flex flex-col sm:items-center">
          <StarRatingDisplay rating={summary.average} />
          <span className="text-xs text-muted-foreground">
            {t("reviewsCount", { count: summary.total })}
          </span>
        </div>
      </div>

      <ul className="flex-1 space-y-1.5">
        {LEVELS.map((star) => {
          const active = selected === star;
          const row = (
            <span className="flex w-full items-center gap-2">
              <span
                className={`w-3 text-right text-xs ${active ? "font-bold text-primary" : "text-muted-foreground"}`}
              >
                {star}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${shares[star]}%` }}
                />
              </span>
              <span className="w-14 whitespace-nowrap text-right text-xs text-muted-foreground">
                {format.number(summary.counts[star])}
              </span>
            </span>
          );
          return (
            <li key={star}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(active ? null : star)}
                  aria-pressed={active}
                  aria-label={t("starReviewsPercent", {
                    star: star,
                    item: summary.counts[star],
                    item2: shares[star],
                  })}
                  className="w-full rounded hover:bg-accent/60"
                >
                  {row}
                </button>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
