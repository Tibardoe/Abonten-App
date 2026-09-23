import { roundRating } from "@abonten/core/ratings";
import {
  type ReviewRatingFilter,
  type ReviewSummary,
  formatReviewCount,
  ratingShares,
} from "@abonten/core/reviews/reviewList";
import { AppText, Stars } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// The overall picture before the individual reviews: the average, how many
// reviews it's based on, and how they split across 1–5 stars. On the full
// Reviews screen each row is also a shortcut to that star filter.

const LEVELS = [5, 4, 3, 2, 1] as const;

export function ReviewSummaryCard({
  summary,
  selected,
  onSelect,
}: {
  summary: ReviewSummary;
  selected?: ReviewRatingFilter;
  /** When set, tapping a row filters the list to that rating (again clears it). */
  onSelect?: (rating: ReviewRatingFilter) => void;
}) {
  const shares = ratingShares(summary);
  const average = roundRating(summary.average);

  return (
    <View className="flex-row gap-4 rounded-xl border border-border bg-card p-4">
      <View className="items-center justify-center" style={{ minWidth: 84 }}>
        <AppText
          className="text-[36px] font-bold leading-[42px]"
          accessibilityLabel={`Average rating ${average.toFixed(1)} out of 5`}
        >
          {average.toFixed(1)}
        </AppText>
        <Stars rating={summary.average} size={13} />
        <AppText variant="caption" className="mt-1 text-center">
          {formatReviewCount(summary.total)}
        </AppText>
      </View>

      <View className="flex-1 justify-center gap-1.5">
        {LEVELS.map((star) => {
          const active = selected === star;
          const row = (
            <View className="flex-row items-center gap-2">
              <AppText
                variant="caption"
                className={`w-3 text-right ${active ? "font-bold text-primary" : ""}`}
              >
                {star}
              </AppText>
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <View
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${shares[star]}%` }}
                />
              </View>
              {/* Wide enough for "10,000"; never wraps under large text. */}
              <AppText
                variant="caption"
                className="w-14 text-right"
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {summary.counts[star].toLocaleString("en-US")}
              </AppText>
            </View>
          );
          if (!onSelect) return <View key={star}>{row}</View>;
          return (
            <Pressable
              key={star}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${star} star: ${summary.counts[star]} reviews, ${shares[star]} percent. ${
                active
                  ? "Showing only these. Tap to show all."
                  : "Tap to show only these."
              }`}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => onSelect(active ? null : star)}
              className="rounded active:opacity-60"
            >
              {row}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
