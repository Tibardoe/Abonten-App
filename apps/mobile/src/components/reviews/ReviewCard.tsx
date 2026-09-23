import { getRelativeTime } from "@abonten/core/dateFormatter";
import {
  type ReviewListRow,
  type ReviewSubjectKind,
  reviewerDisplayName,
} from "@abonten/core/reviews/reviewList";
import {
  AppText,
  Avatar,
  Icon,
  PressableScale,
  Stars,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { memo, useState } from "react";
import { Pressable, View } from "react-native";
import { ReviewPhotoStrip } from "./ReviewPhotoStrip";

// One public review, the same on an event and a place, on the details
// preview and the full Reviews screen: who wrote it, the stars, when (and
// whether it was edited), the text, photos, the organizer's / owner's reply,
// "Helpful", and a ⋯ menu (share, report, block — or edit / delete on your
// own). Long text is folded so a single essay can't push the rest off the
// screen.

const FOLD_AT = 240;

export type ReviewCardProps = {
  review: ReviewListRow;
  kind: ReviewSubjectKind;
  /** The viewer wrote it: no Helpful button, a "Your review" tag instead. */
  isOwn?: boolean;
  /** Pinned from a shared link. */
  highlighted?: boolean;
  /** Absent when the viewer can't vote (signed out is handled by the caller). */
  onToggleHelpful?: (helpful: boolean) => void;
  onMore?: () => void;
};

function ReviewCardImpl({
  review,
  kind,
  isOwn = false,
  highlighted = false,
  onToggleHelpful,
  onMore,
}: ReviewCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const name = reviewerDisplayName(review.reviewer, kind);
  const profileHref =
    !review.reviewer.deleted && review.reviewer.username
      ? `/(app)/user/${review.reviewer.username}`
      : null;
  const long = (review.comment?.length ?? 0) > FOLD_AT;
  const when = getRelativeTime(review.createdAt);
  const helpfulLabel =
    review.helpfulCount === 1
      ? "1 person found this helpful"
      : `${review.helpfulCount.toLocaleString("en-US")} people found this helpful`;

  return (
    <View
      className={`gap-2 rounded-xl border bg-card p-3 ${
        highlighted ? "border-primary" : "border-border"
      }`}
    >
      {highlighted ? (
        <View className="flex-row items-center gap-1">
          <Icon name="link-outline" size={13} tone="primary" />
          <AppText variant="caption" tone="brand" className="font-semibold">
            Shared review
          </AppText>
        </View>
      ) : null}

      <View className="flex-row items-center gap-2.5">
        <Pressable
          accessibilityRole={profileHref ? "button" : undefined}
          accessibilityLabel={profileHref ? `${name}'s profile` : undefined}
          disabled={!profileHref}
          onPress={profileHref ? () => router.push(profileHref) : undefined}
          className="flex-1 flex-row items-center gap-2.5 active:opacity-70"
        >
          <Avatar
            publicId={review.reviewer.avatarPublicId ?? undefined}
            version={review.reviewer.avatarVersion ?? undefined}
            size={34}
          />
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <AppText
                variant="small"
                className="shrink font-semibold"
                numberOfLines={1}
              >
                {name}
              </AppText>
              {isOwn ? (
                <View className="rounded-full bg-accent px-2 py-0.5">
                  <AppText variant="caption" tone="brand">
                    You
                  </AppText>
                </View>
              ) : null}
            </View>
            {kind === "event" && review.isVerifiedAttendee ? (
              <View className="flex-row items-center gap-1">
                <Icon name="checkmark-circle" size={12} tone="success" />
                <AppText variant="caption" tone="success">
                  Verified attendee
                </AppText>
              </View>
            ) : null}
          </View>
        </Pressable>
        {onMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Review options"
            hitSlop={10}
            onPress={onMore}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
          >
            <Icon name="ellipsis-horizontal" size={18} tone="muted" />
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row items-center gap-2">
        <Stars rating={review.rating} size={13} />
        <AppText variant="caption">
          {when}
          {review.editedAt ? " · Edited" : ""}
        </AppText>
      </View>

      {review.title ? (
        <AppText variant="small" className="font-semibold">
          {review.title}
        </AppText>
      ) : null}
      {review.comment ? (
        <View>
          <AppText
            variant="body"
            tone="muted"
            numberOfLines={long && !expanded ? 5 : undefined}
          >
            {review.comment}
          </AppText>
          {long ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => setExpanded((v) => !v)}
              className="mt-1 self-start active:opacity-60"
            >
              <AppText variant="small" tone="brand" className="font-semibold">
                {expanded ? "Show less" : "Read more"}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {review.photos.length ? (
        <ReviewPhotoStrip photos={review.photos} />
      ) : null}

      {review.response ? (
        <View className="ml-3 mt-1 rounded-lg border-l-4 border-primary bg-muted p-3">
          <AppText variant="label" className="mb-1 text-primary">
            {kind === "event" ? "Organizer's reply" : "Owner's reply"}
          </AppText>
          <AppText variant="small">{review.response}</AppText>
        </View>
      ) : null}

      {isOwn ? (
        review.helpfulCount > 0 ? (
          <AppText variant="caption">{helpfulLabel}</AppText>
        ) : null
      ) : onToggleHelpful ? (
        <View className="flex-row items-center gap-3 pt-1">
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={
              review.viewerFoundHelpful
                ? "Marked as helpful. Tap to undo."
                : "Mark this review as helpful"
            }
            accessibilityState={{ selected: review.viewerFoundHelpful }}
            onPress={() => onToggleHelpful(!review.viewerFoundHelpful)}
            haptic={false}
            activeScale={0.95}
            className={`min-h-[36px] flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
              review.viewerFoundHelpful
                ? "bg-primary"
                : "border border-border bg-muted"
            }`}
          >
            <Icon
              name={
                review.viewerFoundHelpful ? "thumbs-up" : "thumbs-up-outline"
              }
              size={15}
              tone={review.viewerFoundHelpful ? "inverse" : "muted"}
            />
            <AppText
              className={`text-[13px] font-semibold ${
                review.viewerFoundHelpful
                  ? "text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              Helpful
              {review.helpfulCount > 0
                ? ` · ${review.helpfulCount.toLocaleString("en-US")}`
                : ""}
            </AppText>
          </PressableScale>
        </View>
      ) : review.helpfulCount > 0 ? (
        <AppText variant="caption">{helpfulLabel}</AppText>
      ) : null}
    </View>
  );
}

export const ReviewCard = memo(ReviewCardImpl);
