import {
  flattenReviews,
  usePlaceReviews,
  useRespondToPlaceReview,
} from "@/features/organizer/usePlaceBookingsReviews";
import type { OwnerPlaceReviewRow } from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { AppText, Button, Icon, Input } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  View,
} from "react-native";

// Per-place reviews (owner view) + reply — the native mirror of the web
// ManagePlaceReviewsSection. Approved reviews only, newest first; each
// review without an owner_response yet gets an inline Respond form.

function Stars({ rating }: { rating: number }) {
  return (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((s) => (
        <Icon
          key={s}
          name={rating >= s ? "star" : "star-outline"}
          size={14}
          tone={rating >= s ? "primary" : "muted"}
        />
      ))}
    </View>
  );
}

function ReviewCard({
  review,
  placeId,
}: {
  review: OwnerPlaceReviewRow;
  placeId: string;
}) {
  const reply = useRespondToPlaceReview(placeId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const photos = review.place_review_photo ?? [];

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    reply.mutate(
      { reviewId: review.id, response: trimmed },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            setOpen(false);
            setText("");
          } else {
            Alert.alert("Couldn't post response", res.message);
          }
        },
        onError: () =>
          Alert.alert(
            "Couldn't post response",
            "Please try again in a moment.",
          ),
      },
    );
  };

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-3">
        {review.user_info?.avatar_public_id ? (
          <Image
            source={{
              uri: buildCloudinaryUrl(
                review.user_info.avatar_public_id,
                review.user_info.avatar_version,
                { width: 40, height: 40 },
              ),
            }}
            style={{ width: 40, height: 40, borderRadius: 20 }}
            contentFit="cover"
          />
        ) : (
          <View className="h-10 w-10 rounded-full bg-muted" />
        )}
        <View className="flex-1">
          <AppText variant="bodyStrong" numberOfLines={1}>
            {review.user_info?.username ?? "Anonymous"}
          </AppText>
          <AppText variant="caption">
            {getRelativeTime(review.created_at)}
          </AppText>
        </View>
        <Stars rating={review.rating} />
      </View>

      {review.title ? (
        <AppText variant="bodyStrong">{review.title}</AppText>
      ) : null}
      {review.comment ? (
        <AppText variant="small">{review.comment}</AppText>
      ) : null}

      {photos.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {photos.map((p) => (
            <Image
              key={p.id}
              source={{
                uri: buildCloudinaryUrl(p.public_id, p.version, {
                  width: 160,
                  height: 160,
                }),
              }}
              style={{ width: 72, height: 72, borderRadius: 8 }}
              contentFit="cover"
            />
          ))}
        </View>
      ) : null}

      {review.owner_response ? (
        <View className="ml-4 mt-1 rounded-lg border-l-4 border-primary bg-muted p-3">
          <AppText variant="label" className="mb-1 text-primary">
            Response from owner
          </AppText>
          <AppText variant="small">{review.owner_response}</AppText>
        </View>
      ) : open ? (
        <View className="ml-4 mt-1 gap-2">
          <Input
            value={text}
            onChangeText={setText}
            placeholder="Write a response to this review…"
            multiline
            numberOfLines={3}
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
          className="mt-1 font-semibold text-primary"
          onPress={() => setOpen(true)}
        >
          Respond
        </AppText>
      )}
    </View>
  );
}

export default function PlaceReviewsScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const id = placeId ?? "";
  const q = usePlaceReviews(id);

  const rows = flattenReviews(q.data?.pages);
  const firstPage = q.data?.pages[0];
  const failed = q.isError || (firstPage && firstPage.status >= 400);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <ReviewCard review={item} placeId={id} />}
      contentContainerClassName="gap-3 p-4 pb-16"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => q.refetch()}
        />
      }
      ListEmptyComponent={
        q.isLoading ? (
          <ActivityIndicator className="mt-10" />
        ) : (
          <AppText variant="muted" className="mt-10 text-center">
            {failed
              ? firstPage && firstPage.status === 403
                ? "You're not authorized to manage this place."
                : "Couldn't load reviews."
              : "No reviews yet."}
          </AppText>
        )
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
      }
    />
  );
}
