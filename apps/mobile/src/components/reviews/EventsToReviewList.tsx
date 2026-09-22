import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { RowListSkeleton } from "@/components/skeletons";
import { useEventsAwaitingReview } from "@/features/reviews/useEventReviews";
import { useQueryView } from "@/lib/useQueryView";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { AppText, Button, Card, EmptyState } from "@abonten/ui-native";
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
  const query = useEventsAwaitingReview();
  const { data } = query;
  const events = data ?? [];
  // "Nothing to review yet" is only ever said for an answer the server
  // gave; loading, offline and failed are told apart.
  const view = useQueryView(query, () => events.length === 0);
  const router = useRouter();
  const [reviewing, setReviewing] = useState<{
    id: string;
    title: string;
  } | null>(null);

  if (view.kind === "empty") {
    return (
      <EmptyState
        icon="star-outline"
        title="Nothing to review yet"
        description="Events you've attended show up here once they end."
      />
    );
  }
  if (view.kind !== "content") {
    return (
      <QueryUnavailable
        view={view}
        subject="events to review"
        onRetry={() => query.refetch()}
        loading={<RowListSkeleton count={4} />}
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
