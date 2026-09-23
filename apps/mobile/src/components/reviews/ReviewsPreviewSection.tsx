import {
  type ReviewSubject,
  useOwnReview,
} from "@/features/reviews/useReviewSubject";
import {
  useReviewPreview,
  useReviewSummary,
} from "@/features/reviews/useReviews";
import { useQueryView } from "@/lib/useQueryView";
import { roundRating } from "@abonten/core/ratings";
import {
  emptyReviewsMessage,
  formatReviewCount,
} from "@abonten/core/reviews/reviewList";
import {
  AppText,
  Button,
  Icon,
  SectionTitle,
  Skeleton,
  Stars,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { OwnReviewCard } from "./OwnReviewCard";
import { ReviewCard } from "./ReviewCard";
import { useReviewInteractions } from "./useReviewInteractions";

// The reviews block on an event or place details screen. It never loads the
// whole history: one aggregate (average, count) and the three most helpful
// reviews, then "See all N reviews" opens the full, filterable Reviews
// screen. Your own review sits on top with its own menu; if you can review
// and haven't, "Write a review" is offered instead.

export function reviewsHref(subject: Pick<ReviewSubject, "kind" | "id">) {
  return `/(app)/reviews/${subject.kind}/${subject.id}`;
}

const SKELETON_KEYS = ["sk-a", "sk-b", "sk-c", "sk-d", "sk-e", "sk-f"];

/** Review-card-shaped placeholders, for the preview and the Reviews screen. */
export function ReviewCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <View className="gap-2">
      {SKELETON_KEYS.slice(0, count).map((k) => (
        <View
          key={k}
          className="gap-2 rounded-xl border border-border bg-card p-3"
        >
          <View className="flex-row items-center gap-2.5">
            <Skeleton width={34} height={34} radius={17} />
            <Skeleton width={128} height={12} />
          </View>
          <Skeleton width={96} height={12} />
          <Skeleton height={12} />
          <Skeleton width="80%" height={12} />
        </View>
      ))}
    </View>
  );
}

export function ReviewsPreviewSection({
  subject,
}: {
  subject: ReviewSubject;
}) {
  const router = useRouter();
  const summary = useReviewSummary(subject.kind, subject.id);
  const preview = useReviewPreview(subject.kind, subject.id);
  const previewView = useQueryView(preview);
  const own = useOwnReview(subject);
  const interactions = useReviewInteractions(subject);

  const total = summary.data?.total ?? 0;
  const average = roundRating(summary.data?.average ?? 0);
  const reviews = preview.data ?? [];
  const shown = reviews.length + (own.state === "has_review" ? 1 : 0);
  const openAll = () => router.push(reviewsHref(subject));
  const empty = emptyReviewsMessage(null, subject.kind);

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <SectionTitle>Reviews</SectionTitle>
        {total > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`See all ${formatReviewCount(total)}`}
            hitSlop={8}
            onPress={openAll}
            className="flex-row items-center gap-0.5 active:opacity-60"
          >
            <AppText variant="small" tone="brand" className="font-semibold">
              See all
            </AppText>
            <Icon name="chevron-forward" size={14} tone="primary" />
          </Pressable>
        ) : null}
      </View>

      {total > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Rated ${average.toFixed(1)} out of 5 from ${formatReviewCount(total)}. See the rating breakdown.`}
          onPress={openAll}
          className="flex-row items-center gap-3 active:opacity-70"
        >
          <AppText className="text-[28px] font-bold leading-[34px]">
            {average.toFixed(1)}
          </AppText>
          <View className="gap-0.5">
            <Stars rating={summary.data?.average ?? 0} size={14} />
            <AppText variant="caption">{formatReviewCount(total)}</AppText>
          </View>
        </Pressable>
      ) : null}

      {own.state === "can_review" ||
      (own.state === "signed_out" && subject.kind === "place") ? (
        <Button
          title="Write a review"
          variant="outline"
          leftIcon="create-outline"
          onPress={() => interactions.openComposer()}
        />
      ) : own.state === "has_review" ? (
        <OwnReviewCard
          review={own.review}
          kind={subject.kind}
          onMore={() => interactions.openOwnMenu(own.review)}
        />
      ) : null}

      {previewView.kind === "loading" ? (
        <ReviewCardsSkeleton />
      ) : reviews.length > 0 ? (
        <View className="gap-2">
          {reviews.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              kind={subject.kind}
              {...interactions.cardProps(r)}
            />
          ))}
        </View>
      ) : previewView.kind === "offline" ? (
        <AppText variant="muted">
          Reviews will load when you're back online.
        </AppText>
      ) : previewView.kind === "error" ? (
        <View className="flex-row items-center justify-between gap-3">
          <AppText variant="muted" className="flex-1">
            Couldn't load reviews.
          </AppText>
          <Button
            title="Try again"
            variant="outline"
            size="sm"
            onPress={() => {
              void preview.refetch();
              void summary.refetch();
            }}
          />
        </View>
      ) : own.state !== "has_review" ? (
        <View className="gap-1 rounded-xl border border-dashed border-border p-4">
          <AppText variant="bodyStrong">{empty.title}</AppText>
          <AppText variant="muted">
            {own.state === "not_eligible"
              ? own.message
              : own.state === "owner"
                ? `Reviews will appear here as people review your ${subject.kind}.`
                : empty.description}
          </AppText>
        </View>
      ) : null}

      {total > shown ? (
        <Button
          title={`See all ${formatReviewCount(total)}`}
          variant="outline"
          rightIcon="chevron-forward"
          onPress={openAll}
        />
      ) : null}

      {interactions.sheets}
    </View>
  );
}
