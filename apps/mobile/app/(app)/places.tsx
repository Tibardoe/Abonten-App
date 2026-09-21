import { PlaceCard } from "@/components/PlaceCard";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { PlaceListSkeleton } from "@/components/skeletons";
import { useDeviceLocation } from "@/features/discovery/useDeviceLocation";
import { useNearbyPlaces } from "@/features/places/useNearbyPlaces";
import { useQueryView } from "@/lib/useQueryView";
import type { PlaceType } from "@abonten/types/placeType";
import {
  Button,
  Caption,
  EmptyState,
  Refresher,
  Spinner,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, View } from "react-native";

export default function Places() {
  const router = useRouter();
  const { location } = useDeviceLocation();
  const q = useNearbyPlaces(location);

  const places: PlaceType[] = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const view = useQueryView(q, () => places.length === 0);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          variant="title"
          title="Places"
          backFallback="/(app)/account"
        />
        <PlaceListSkeleton />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title="Places" backFallback="/(app)/account" />
      <View className="px-4 pt-4">
        <Button
          title="Add place"
          size="sm"
          onPress={() => router.push("/(app)/place/new")}
        />
      </View>

      {location?.isFallback ? (
        <View className="px-4 pb-1 pt-3">
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
        refreshControl={<Refresher onRefresh={() => q.refetch()} />}
        ListEmptyComponent={
          view.kind === "empty" ? (
            <EmptyState
              icon="location-outline"
              title="No places nearby"
              description="Check back soon."
            />
          ) : (
            <QueryUnavailable
              view={view}
              subject="places nearby"
              onRetry={() => q.refetch()}
            />
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
      />
    </View>
  );
}
