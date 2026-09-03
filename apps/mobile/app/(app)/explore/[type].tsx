import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { AppHeader } from "@/components/app/AppHeader";
import { ActiveFilterChips } from "@/components/explore/ActiveFilterChips";
import { EventListSkeleton, PlaceListSkeleton } from "@/components/skeletons";
import { useExploreFilters } from "@/features/discovery/ExploreFiltersProvider";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import {
  clearEventFilterKey,
  clearPlaceFilterKey,
  countActiveEventFilters,
  countActivePlaceFilters,
  describeEventFilters,
  describePlaceFilters,
  filterEventList,
  filterPlaceList,
} from "@/features/discovery/exploreFilters";
import {
  type EventSliders,
  useExploreEventSliders,
} from "@/features/discovery/useExploreEventSliders";
import {
  type PlaceSliders,
  useExplorePlaceSliders,
} from "@/features/discovery/useExplorePlaceSliders";
import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { EmptyState } from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
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
  const {
    eventFilters,
    placeFilters,
    setEventFilters,
    setPlaceFilters,
    clearEventFilters,
    clearPlaceFilters,
  } = useExploreFilters();

  const eventSliders = useExploreEventSliders(coords, location?.label ?? "");
  const placeSliders = useExplorePlaceSliders(coords);
  const placeCategories = usePlaceCategories().data ?? [];

  const isEvent = kind === "event";
  const query = isEvent ? eventSliders : placeSliders;

  // The "See all" window must honour whatever filters were active on the
  // strip it expanded — same client-side predicate the Explore screen runs.
  const rawEvents = isEvent
    ? (eventSliders.data[sliderKey as EventKey] ?? [])
    : [];
  const rawPlaces = !isEvent
    ? (placeSliders.data[sliderKey as PlaceKey] ?? [])
    : [];
  const events = useMemo(
    () => filterEventList(rawEvents, eventFilters, coords),
    [rawEvents, eventFilters, coords],
  );
  const places = useMemo(
    () => filterPlaceList(rawPlaces, placeFilters),
    [rawPlaces, placeFilters],
  );
  const loading = query.isLoading;

  const filterCount = isEvent
    ? countActiveEventFilters(eventFilters)
    : countActivePlaceFilters(placeFilters);
  const selectedPlaceCategoryName =
    placeFilters.categoryId != null
      ? (placeCategories.find((c) => c.id === placeFilters.categoryId)?.name ??
        null)
      : null;
  const activeChips = isEvent
    ? describeEventFilters(eventFilters)
    : describePlaceFilters(placeFilters, selectedPlaceCategoryName);

  const header = (
    <View>
      <AppHeader
        variant="title"
        title={title ?? "All"}
        backFallback="/(app)/(tabs)"
      />
      {filterCount > 0 ? (
        <ActiveFilterChips
          chips={activeChips}
          onRemove={(key) => {
            if (isEvent)
              setEventFilters(clearEventFilterKey(eventFilters, key));
            else setPlaceFilters(clearPlaceFilterKey(placeFilters, key));
          }}
          onClearAll={isEvent ? clearEventFilters : clearPlaceFilters}
        />
      ) : null}
    </View>
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
              title={
                filterCount > 0
                  ? "No events match your filters"
                  : "Nothing here right now"
              }
              description={
                filterCount > 0
                  ? "Try widening or clearing your filters."
                  : "Check back soon, or change your location."
              }
              actionLabel={filterCount > 0 ? "Clear filters" : undefined}
              onAction={filterCount > 0 ? clearEventFilters : undefined}
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
              title={
                filterCount > 0
                  ? "No places match your filters"
                  : "Nothing here right now"
              }
              description={
                filterCount > 0
                  ? "Try widening or clearing your filters."
                  : "Check back soon, or change your location."
              }
              actionLabel={filterCount > 0 ? "Clear filters" : undefined}
              onAction={filterCount > 0 ? clearPlaceFilters : undefined}
            />
          }
        />
      )}
    </View>
  );
}
