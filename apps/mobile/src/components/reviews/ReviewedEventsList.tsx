import {
  useDeleteEventReview,
  useUserEventReviews,
} from "@/features/reviews/useEventReviews";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import {
  AppText,
  Badge,
  EmptyState,
  Icon,
  ScreenLoader,
  Spinner,
  Stars,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { ReviewPhotoStrip } from "./ReviewPhotoStrip";

// Native echo of the web ReviewedEventsList: the reviewer's own event_review
// history, cursor-paginated. Tap the title to open the event; the trash icon
// deletes the review (event_review_reviewer_delete RLS), which puts the
// event back in "To Review".

export function ReviewedEventsList() {
  const q = useUserEventReviews();
  const del = useDeleteEventReview();
  const router = useRouter();

  const reviews = q.data?.pages.flatMap((p) => p.reviews) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  const confirmDelete = (id: string) =>
    Alert.alert("Delete review?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => del.mutate(id),
      },
    ]);

  if (q.isLoading) return <ScreenLoader />;

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon="chatbox-ellipses-outline"
        title={q.isError ? "Couldn't load your reviews" : "No reviews yet"}
        description={
          q.isError
            ? "Pull down to try again."
            : "Reviews you write appear here."
        }
      />
    );
  }

  return (
    <FlatList
      data={reviews}
      keyExtractor={(r) => r.id}
      contentContainerClassName="gap-3 px-4 pb-16"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
      renderItem={({ item }) => (
        <View className="gap-2 rounded-xl border border-border bg-card p-3">
          <View className="flex-row gap-3">
            {item.event ? (
              <Image
                source={{
                  uri: buildCloudinaryUrl(
                    item.event.flyer_public_id,
                    item.event.flyer_version,
                    { width: 140, height: 100 },
                  ),
                }}
                style={{ width: 60, height: 60, borderRadius: 8 }}
                contentFit="cover"
              />
            ) : null}
            <View className="flex-1 gap-1">
              <AppText
                variant="cardTitle"
                numberOfLines={1}
                onPress={() =>
                  item.event && router.push(`/(app)/event/${item.event.id}`)
                }
              >
                {item.event?.title ?? "Event"}
              </AppText>
              <View className="flex-row items-center gap-2">
                <Stars rating={item.rating} />
                <AppText variant="caption">
                  {getRelativeTime(item.created_at)}
                </AppText>
              </View>
            </View>
            <Pressable
              onPress={() => confirmDelete(item.id)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Delete review"
            >
              <Icon name="trash-outline" size={18} tone="destructive" />
            </Pressable>
          </View>

          {item.title ? (
            <AppText variant="bodyStrong">{item.title}</AppText>
          ) : null}
          {item.comment ? (
            <AppText variant="small">{item.comment}</AppText>
          ) : null}
          <ReviewPhotoStrip photos={item.event_review_photo} />
          {item.is_verified_attendee ? (
            <View className="self-start">
              <Badge tone="success" label="Verified Attendee" />
            </View>
          ) : null}
        </View>
      )}
    />
  );
}
