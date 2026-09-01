import { PlaceCard } from "@/components/PlaceCard";
import { useDeviceLocation } from "@/features/discovery/useDeviceLocation";
import { useNearbyPlaces } from "@/features/places/useNearbyPlaces";
import type { PlaceType } from "@abonten/types/placeType";
import { Caption, EmptyState, ScreenLoader, Spinner } from "@abonten/ui-native";
import { useCallback } from "react";
import { FlatList, RefreshControl, View } from "react-native";

export default function Places() {
  const { location } = useDeviceLocation();
  const q = useNearbyPlaces(location);

  const places: PlaceType[] = q.data?.pages.flatMap((p) => p.rows) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) return <ScreenLoader />;

  return (
    <View className="flex-1 bg-background">
      {location?.isFallback ? (
        <View className="px-4 pb-1 pt-4">
          <Caption>
            Showing Accra — enable location for places near you.
          </Caption>
        </View>
      ) : null}

      <FlatList
        data={places}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PlaceCard place={item} />}
        contentContainerClassName="gap-4 px-4 pb-16 pt-4"
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching && !q.isFetchingNextPage}
            onRefresh={() => q.refetch()}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="location-outline"
            title={q.isError ? "Couldn't load places" : "No places nearby"}
            description={
              q.isError ? "Pull down to try again." : "Check back soon."
            }
          />
        }
        ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
      />
    </View>
  );
}
