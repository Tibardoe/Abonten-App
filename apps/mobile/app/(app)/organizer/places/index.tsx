import {
  flattenOrganizerPlaces,
  useOrganizerPlaces,
} from "@/features/organizer/useOrganizerPlaces";
import type { OrganizerPlaceRow } from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

const CLOSED_LABEL: Record<string, string> = {
  permanently_closed: "Permanently closed",
  temporarily_closed: "Temporarily closed",
};

function OrganizerPlaceCard({ place }: { place: OrganizerPlaceRow }) {
  const router = useRouter();
  const cover =
    place.cover_public_id && place.cover_version
      ? buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
          width: 200,
          height: 200,
        })
      : null;
  const closed = place.temporary_status
    ? (CLOSED_LABEL[place.temporary_status] ?? null)
    : null;

  return (
    <Pressable
      className="flex-row gap-3 rounded-xl border border-border bg-card p-3 active:opacity-90"
      onPress={() => router.push(`/(app)/organizer/places/${place.id}`)}
    >
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={{ width: 64, height: 64, borderRadius: 8 }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View className="h-16 w-16 items-center justify-center rounded-lg bg-muted">
          <Text className="text-[10px] text-muted-foreground">No image</Text>
        </View>
      )}
      <View className="flex-1 justify-center gap-1">
        <Text
          className="text-sm font-semibold text-foreground"
          numberOfLines={1}
        >
          {place.name}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {place.place_category?.name ?? "Uncategorized"}
          {closed ? ` · ${closed}` : ""}
        </Text>
      </View>
      <Text className="self-center text-muted-foreground">›</Text>
    </Pressable>
  );
}

export default function OrganizerPlacesScreen() {
  const q = useOrganizerPlaces();
  const places = flattenOrganizerPlaces(q.data?.pages);
  const failed =
    q.isError || (q.data?.pages[0] && q.data.pages[0].status >= 400);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={places}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <OrganizerPlaceCard place={item} />}
      contentContainerClassName="gap-3 p-4 pb-16"
      ListHeaderComponent={
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-xl font-bold text-foreground">My places</Text>
          <Link href="/(app)/place/new" asChild>
            <Pressable className="rounded-lg bg-primary px-3 py-1.5 active:opacity-90">
              <Text className="text-sm font-semibold text-primary-foreground">
                Add place
              </Text>
            </Pressable>
          </Link>
        </View>
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => q.refetch()}
        />
      }
      ListEmptyComponent={
        <Text className="mt-10 text-center text-sm text-muted-foreground">
          {failed
            ? "Couldn't load your places."
            : "You haven't added any places yet."}
        </Text>
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
      }
    />
  );
}
