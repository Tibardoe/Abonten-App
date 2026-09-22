import { PlaceCard } from "@/components/PlaceCard";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { AreaSuggestionCard } from "@/components/explore/AreaSuggestionCard";
import { AreaSwitcher } from "@/components/explore/AreaSwitcher";
import { ChangeLocationSheet } from "@/components/explore/ChangeLocationSheet";
import { whereText } from "@/components/explore/areaCopy";
import { PlaceListSkeleton } from "@/components/skeletons";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useNearbyPlaces } from "@/features/places/useNearbyPlaces";
import { useQueryView } from "@/lib/useQueryView";
import type { PlaceType } from "@abonten/types/placeType";
import { Button, EmptyState, Refresher, Spinner } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";

// Places around the browsing area — the same area Explore shows, with the
// same switcher, so "near you" here and there are always the same place.
export default function Places() {
  const router = useRouter();
  const { area, resolving } = useExploreLocation();
  const coords = area ? { lat: area.lat, lng: area.lng } : null;
  const q = useNearbyPlaces(coords);
  const [locationOpen, setLocationOpen] = useState(false);

  const places: PlaceType[] = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const view = useQueryView(q, () => places.length === 0);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  const header = (
    <View>
      <AppHeader variant="title" title="Places" backFallback="/(app)/account" />
      <View className="flex-row items-center justify-between gap-2 px-4 pb-2 pt-3">
        <AreaSwitcher onPress={() => setLocationOpen(true)} />
        <Button
          title="Add place"
          size="sm"
          onPress={() => router.push("/(app)/place/new")}
        />
      </View>
      <AreaSuggestionCard />
    </View>
  );

  if (resolving || q.isLoading) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <PlaceListSkeleton />
        <ChangeLocationSheet
          open={locationOpen}
          onClose={() => setLocationOpen(false)}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {header}

      <FlatList
        data={places}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <PlaceCard place={item} />}
        contentContainerClassName="gap-4 px-4 pb-16 pt-2"
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={<Refresher onRefresh={() => q.refetch()} />}
        ListEmptyComponent={
          view.kind === "empty" ? (
            <EmptyState
              icon="location-outline"
              title={`No places ${whereText(area)}`}
              description="Check back soon, or change your location."
            />
          ) : (
            <QueryUnavailable
              view={view}
              subject="places here"
              onRetry={() => q.refetch()}
            />
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
      />

      <ChangeLocationSheet
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
      />
    </View>
  );
}
