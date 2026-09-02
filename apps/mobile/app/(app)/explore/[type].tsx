import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { AppHeader } from "@/components/app/AppHeader";
import { EventListSkeleton, PlaceListSkeleton } from "@/components/skeletons";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import {
  type EventSliders,
  useExploreEventSliders,
} from "@/features/discovery/useExploreEventSliders";
import {
  type PlaceSliders,
  useExplorePlaceSliders,
} from "@/features/discovery/useExplorePlaceSliders";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { EmptyState } from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, View } from "react-native";

// The "See all" window for one curated Explore slider. It re-uses the exact
// same curated hook the Explore screen's strip is derived from — one bounded
// nearby fetch, sliced by the same `filterEventsByWindow` rules — so this is
// the full list with no new query and no divergence from what the strip
// showed. `kind` + `sliderKey` + `title` come in as route params.

type EventKey = keyof EventSliders;
type PlaceKey = keyof PlaceSliders;

export default function ExploreSectionScreen() {
  // `type` is the dynamic route segment and doubles as the slider key
  // (e.g. "happeningToday"); `kind` + `title` ride along as query params.
  const {
    type: sliderKey,
    kind,
    title,
  } = useLocalSearchParams<{
    type: string;
    kind: "event" | "place";
    title: string;
  }>();
  const { location } = useExploreLocation();
  const coords = location ? { lat: location.lat, lng: location.lng } : null;

  const eventSliders = useExploreEventSliders(coords, location?.label ?? "");
  const placeSliders = useExplorePlaceSliders(coords);

  const isEvent = kind === "event";
  const query = isEvent ? eventSliders : placeSliders;
  const events = isEvent
    ? (eventSliders.data[sliderKey as EventKey] ?? [])
    : [];
  const places = !isEvent
    ? (placeSliders.data[sliderKey as PlaceKey] ?? [])
    : [];
  const loading = query.isLoading;

  const header = (
    <AppHeader
      variant="title"
      title={title ?? "All"}
      backFallback="/(app)/(tabs)"
    />
  );

  if (loading) {
    return (
      <View className="flex-1 bg-background">
        {header}
        {isEvent ? <EventListSkeleton /> : <PlaceListSkeleton />}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {header}
      {isEvent ? (
        <FlatList
          data={events as UserPostType[]}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerClassName="gap-4 px-4 pb-16 pt-3"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title="Nothing here right now"
              description="Check back soon, or change your location."
            />
          }
        />
      ) : (
        <FlatList
          data={places as PlaceType[]}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PlaceCard place={item} />}
          contentContainerClassName="gap-4 px-4 pb-16 pt-3"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="location-outline"
              title="Nothing here right now"
              description="Check back soon, or change your location."
            />
          }
        />
      )}
    </View>
  );
}
