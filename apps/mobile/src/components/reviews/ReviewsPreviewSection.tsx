import {
  type ReviewSubject,
  useOwnReview,
} from "@/features/reviews/useReviewSubject";
import {
  useReviewPreview,
  useReviewSummary,
} from "@/features/reviews/useReviews";
import { useQueryView } from "@/lib/useQueryView";
import { formatRating } from "@abonten/core/i18n/format";
import { roundRating } from "@abonten/core/ratings";
import {} from "@abonten/core/reviews/reviewList";
import {
  AppText,
  Button,
  Icon,
  SectionTitle,
  Skeleton,
  Stars,
} from "@abonten/ui-native";
import { getCurrentLocale, useTranslations } from "@abonten/ui-native/i18n";
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
  const t = useTranslations("reviews");

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
  const empty = {
    title: t("noReviewsYet"),
    description:
      subject.kind === "event"
        ? t("peopleWhoAttendedCanReview")
        : t("beTheFirstToShare"),
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <SectionTitle>{t("reviews")}</SectionTitle>
        {total > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("seeAll2", {
              reviews: t("reviewsCount", { count: total }),
            })}
            hitSlop={8}
            onPress={openAll}
            className="flex-row items-center gap-0.5 active:opacity-60"
          >
            <AppText variant="small" tone="brand" className="font-semibold">
              {t("seeAll3")}
            </AppText>
            <Icon name="chevron-forward" size={14} tone="primary" />
          </Pressable>
        ) : null}
      </View>

      {total > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("ratedOutOf5FromSee", {
            toFixed: formatRating(average, getCurrentLocale()),
            reviews: t("reviewsCount", { count: total }),
          })}
          onPress={openAll}
          className="flex-row items-center gap-3 active:opacity-70"
        >
          <AppText className="text-[28px] font-bold leading-[34px]">
            {formatRating(average, getCurrentLocale())}
          </AppText>
          <View className="gap-0.5">
            <Stars rating={summary.data?.average ?? 0} size={14} />
            <AppText variant="caption">
              {t("reviewsCount", { count: total })}
            </AppText>
          </View>
        </Pressable>
      ) : null}

      {own.state === "can_review" ||
      (own.state === "signed_out" && subject.kind === "place") ? (
        <Button
          title={t("writeAReview")}
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
        <AppText variant="muted">{t("reviewsWillLoadWhenYouRe")}</AppText>
      ) : previewView.kind === "error" ? (
        <View className="flex-row items-center justify-between gap-3">
          <AppText variant="muted" className="flex-1">
            {t("couldnTLoadReviews")}
          </AppText>
          <Button
            title={t("tryAgain")}
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
                ? t("reviewsWillAppearHereAsPeople", { kind: subject.kind })
                : empty.description}
          </AppText>
        </View>
      ) : null}

      {total > shown ? (
        <Button
          title={t("seeAll2", { reviews: t("reviewsCount", { count: total }) })}
          variant="outline"
          rightIcon="chevron-forward"
          onPress={openAll}
        />
      ) : null}

      {interactions.sheets}
    </View>
  );
}
