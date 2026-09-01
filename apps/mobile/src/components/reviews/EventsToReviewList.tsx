import { useEventsAwaitingReview } from "@/features/reviews/useEventReviews";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ScreenLoader,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { AddReviewSheet } from "./AddReviewSheet";

// Native echo of the web EventsToReviewList: the "rate your purchase" inbox —
// every checked-in, ended, unreviewed event, each with a one-tap way into
// the review sheet. An event drops out the moment its review is submitted
// (usePostEventReview invalidates ["reviews","awaiting"]).
export function EventsToReviewList() {
  const { data, isLoading, isError } = useEventsAwaitingReview();
  const router = useRouter();
  const [reviewing, setReviewing] = useState<{
    id: string;
    title: string;
  } | null>(null);

  if (isLoading) return <ScreenLoader />;

  const events = data ?? [];
  if (events.length === 0) {
    return (
      <EmptyState
        icon="star-outline"
        title={isError ? "Couldn't load this list" : "Nothing to review yet"}
        description={
          isError
            ? "Pull down to try again."
            : "Events you've attended show up here once they end."
        }
      />
    );
  }

  return (
    <>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerClassName="gap-3 px-4 pb-16"
        renderItem={({ item }) => (
          <Card className="gap-3">
            <View className="flex-row gap-3">
              <Image
                source={{
                  uri: buildCloudinaryUrl(
                    item.flyer_public_id,
                    item.flyer_version,
                    { width: 160, height: 120 },
                  ),
                }}
                style={{ width: 72, height: 72, borderRadius: 8 }}
                contentFit="cover"
              />
              <View className="flex-1 justify-center gap-1">
                <AppText
                  variant="cardTitle"
                  numberOfLines={2}
                  onPress={() => router.push(`/(app)/event/${item.id}`)}
                >
                  {item.title}
                </AppText>
                <AppText variant="caption">How was this event?</AppText>
              </View>
            </View>
            <Button
              title="Write a review"
              onPress={() => setReviewing({ id: item.id, title: item.title })}
            />
          </Card>
        )}
      />

      <AddReviewSheet
        open={reviewing !== null}
        onClose={() => setReviewing(null)}
        eventId={reviewing?.id ?? ""}
        eventTitle={reviewing?.title ?? ""}
      />
    </>
  );
}
