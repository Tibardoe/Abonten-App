import { ReviewPhotoStrip } from "@/components/reviews/ReviewPhotoStrip";
import {
  type ManageEventReview,
  useEventReviewsManage,
  useRespondToEventReview,
} from "@/features/organizer/useEventReviewsManage";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import {
  AppText,
  Avatar,
  Button,
  Icon,
  Input,
  ListFooter,
  ScreenError,
  Spinner,
  Stars,
} from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, View } from "react-native";

function ReviewCard({
  review,
  eventId,
}: {
  review: ManageEventReview;
  eventId: string;
}) {
  const reply = useRespondToEventReview(eventId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    reply.mutate(
      { reviewId: review.id, response: trimmed },
      {
        onSuccess: () => {
          setOpen(false);
          setText("");
        },
        onError: (e) =>
          Alert.alert(
            "Couldn't post response",
            e instanceof Error ? e.message : "Please try again.",
          ),
      },
    );
  }

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <Avatar
          publicId={review.reviewer?.avatar_public_id ?? undefined}
          version={review.reviewer?.avatar_version ?? undefined}
          size={32}
        />
        <View className="flex-1">
          <AppText variant="bodyStrong" numberOfLines={1}>
            {review.reviewer?.username ?? "Attendee"}
          </AppText>
          <AppText variant="caption">
            {getRelativeTime(review.created_at)}
          </AppText>
        </View>
        <Stars rating={review.rating} size={14} />
      </View>

      {review.is_verified_attendee ? (
        <View className="flex-row items-center gap-1">
          <Icon name="checkmark-circle" size={12} tone="success" />
          <AppText variant="caption" tone="success">
            Verified attendee
          </AppText>
        </View>
      ) : null}

      {review.title ? (
        <AppText variant="small" className="font-semibold">
          {review.title}
        </AppText>
      ) : null}
      {review.comment ? (
        <AppText variant="small">{review.comment}</AppText>
      ) : null}
      {review.event_review_photo?.length ? (
        <ReviewPhotoStrip photos={review.event_review_photo} />
      ) : null}

      {review.organizer_response ? (
        <View className="ml-3 mt-1 rounded-lg border-l-4 border-primary bg-muted p-3">
          <AppText variant="label" className="mb-1 text-primary">
            Your response
          </AppText>
          <AppText variant="small">{review.organizer_response}</AppText>
        </View>
      ) : open ? (
        <View className="mt-1 gap-2">
          <Input
            value={text}
            onChangeText={setText}
            placeholder="Write a response…"
            multiline
            numberOfLines={3}
            style={{ minHeight: 72, textAlignVertical: "top" }}
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                title={reply.isPending ? "Posting…" : "Post response"}
                onPress={submit}
                loading={reply.isPending}
                disabled={reply.isPending || !text.trim()}
                size="sm"
              />
            </View>
            <View className="flex-1">
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => {
                  setOpen(false);
                  setText("");
                }}
                disabled={reply.isPending}
                size="sm"
              />
            </View>
          </View>
        </View>
      ) : (
        <AppText
          variant="small"
          tone="brand"
          className="mt-1 font-semibold"
          onPress={() => setOpen(true)}
        >
          Respond
        </AppText>
      )}
    </View>
  );
}

export default function ManageEventReviewsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";
  const q = useEventReviewsManage(id);
  const rows = q.data?.pages.flatMap((p) => p.reviews) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner />
      </View>
    );
  }
  if (q.isError) {
    return (
      <View className="flex-1 bg-background">
        <ScreenError
          message="Couldn't load reviews."
          onRetry={() => q.refetch()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <ReviewCard review={item} eventId={id} />}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching && !q.isFetchingNextPage}
            onRefresh={() => q.refetch()}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <AppText variant="muted" className="mt-10 text-center">
            No reviews yet.
          </AppText>
        }
        ListFooterComponent={
          <ListFooter
            count={rows.length}
            isFetchingNextPage={q.isFetchingNextPage}
            hasNextPage={q.hasNextPage}
            isError={q.isError}
            onRetry={() => q.fetchNextPage()}
          />
        }
      />
    </View>
  );
}
