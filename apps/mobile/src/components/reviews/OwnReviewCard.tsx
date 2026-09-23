import type { OwnReview } from "@/features/reviews/useReviewSubject";
import { AppText, Icon, Stars } from "@abonten/ui-native";
import { Pressable, View } from "react-native";
import { ReviewPhotoStrip } from "./ReviewPhotoStrip";

// Your own review of this event or place, kept apart from everyone else's so
// it's always easy to find and change. Its ⋯ menu offers edit, share and
// delete.

export function OwnReviewCard({
  review,
  kind,
  onMore,
}: {
  review: OwnReview;
  kind: "event" | "place";
  onMore: () => void;
}) {
  return (
    <View className="gap-2 rounded-xl border border-primary/40 bg-card p-3">
      <View className="flex-row items-center gap-2">
        {/* Stacked, not side by side: a row let the label be squeezed to
            "Your" when the stars re-laid out after an edit. */}
        <View className="flex-1 gap-1">
          <AppText variant="small" className="font-semibold" numberOfLines={1}>
            Your review
          </AppText>
          <Stars rating={review.rating} size={13} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Your review options"
          hitSlop={10}
          onPress={onMore}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-muted"
        >
          <Icon name="ellipsis-horizontal" size={18} tone="muted" />
        </Pressable>
      </View>
      {review.title ? (
        <AppText variant="small" className="font-semibold">
          {review.title}
        </AppText>
      ) : null}
      {review.comment ? (
        <AppText variant="body" tone="muted" numberOfLines={4}>
          {review.comment}
        </AppText>
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
    </View>
  );
}
