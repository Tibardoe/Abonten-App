import { PlaceCard } from "@/components/PlaceCard";
import { useDeviceLocation } from "@/features/discovery/useDeviceLocation";
import { useNearbyPlaces } from "@/features/places/useNearbyPlaces";
import type { PlaceType } from "@abonten/types/placeType";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";

export default function Places() {
  const { location } = useDeviceLocation();
  const q = useNearbyPlaces(location);

  const places: PlaceType[] = q.data?.pages.flatMap((p) => p.rows) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <View className="flex-1 bg-background">
      <View className="gap-1 px-4 pb-2 pt-16">
        <Text className="text-2xl font-bold text-foreground">Places</Text>
        {location?.isFallback ? (
          <Text className="text-xs text-muted-foreground">
            Showing Accra — enable location for places near you.
          </Text>
        ) : null}
      </View>

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PlaceCard place={item} />}
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
              {q.isError ? "Couldn't load places." : "No places found nearby."}
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
