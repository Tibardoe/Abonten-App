import { EventCard } from "@/components/EventCard";
import { useDeviceLocation } from "@/features/discovery/useDeviceLocation";
import { useNearbyEvents } from "@/features/discovery/useNearbyEvents";
import type { UserPostType } from "@abonten/types/postsType";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";

export default function Home() {
  const { location } = useDeviceLocation();
  const q = useNearbyEvents(location);

  const events: UserPostType[] =
    q.data?.pages.flatMap((p) => p.rows as UserPostType[]) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <View className="flex-1 bg-background">
      <View className="gap-1 px-4 pb-2 pt-16">
        <Text className="text-2xl font-bold text-mint">Nearby events</Text>
        {location?.isFallback ? (
          <Text className="text-xs text-muted-foreground">
            Showing Accra — enable location for events near you.
          </Text>
        ) : null}
      </View>

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : q.isError ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-sm text-destructive">
            Couldn't load events. Pull to retry.
          </Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerClassName="gap-4 px-4 pb-16"
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
              No events found nearby.
            </Text>
          }
          ListFooterComponent={
            q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
          }
        />
      )}
    </View>
  );
}
