import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
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
} from "@/features/discovery/exploreFilters";
import { fetchExploreEventSections } from "@/features/discovery/useExploreEventSliders";
import {
  type PlaceSliders,
  useExplorePlaceSliders,
} from "@/features/discovery/useExplorePlaceSliders";
import { useFilteredEvents } from "@/features/discovery/useFilteredEvents";
import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import { useCoreI18n } from "@/features/i18n/useCoreI18n";
import { useMarket } from "@/features/markets/MarketProvider";
import { useQueryView } from "@/lib/useQueryView";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import {
  EXPLORE_AROUND_YOU_KM,
  exploreSectionWindow,
} from "@abonten/core/exploreSections";
import { viewerTimeZone } from "@abonten/core/time/timeZone";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { EmptyState, ListFooter, Refresher } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { FlatList, View } from "react-native";

// The "See all" list behind one Explore row. `kind` + `sliderKey` + `title`
// come in as route params.
//
// An event row is the start of a list the database keeps going: the same
// rule that chose the row (the area, the active filters, and for a time row
// its stretch of time) is asked for page after page, so "See all" really is
// all of them. It used to show the row again, cut from the first 60 nearby
// events. "From top-rated organizers" is a ranking rather than a feed, and
// comes as one list of the best 60.
//
// A place row is a short list already (nearest, open now, best rated,
// each with the active filters), so its "See all" is that list.

type PlaceKey = keyof PlaceSliders;

const TOP_RATED_SIZE = 60;

export default function ExploreSectionScreen() {
  const t = useTranslations("explore");
  const i18n = useCoreI18n();

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
  const { area } = useExploreLocation();
  const { market } = useMarket();
  const coords = area ? { lat: area.lat, lng: area.lng } : null;
  const {
    eventFilters,
    placeFilters,
    setEventFilters,
    setPlaceFilters,
    clearEventFilters,
    clearPlaceFilters,
  } = useExploreFilters();

  const isEvent = kind === "event";
  const section = String(sliderKey);
  const isTopRated = isEvent && section === "topRatedOrganizers";

  // The stretch of time of a time row, fixed when the screen opens ("the
  // next seven days" must not move while the list is being paged).
  const window = useMemo(
    () => (isEvent ? exploreSectionWindow(section, viewerTimeZone()) : null),
    [isEvent, section],
  );
  // "Around you" is the smaller area inside the one Explore browses.
  const listFilters = useMemo(
    () =>
      section === "aroundYou"
        ? {
            ...eventFilters,
            maxDistanceKm: Math.min(
              EXPLORE_AROUND_YOU_KM,
              eventFilters.maxDistanceKm ?? EXPLORE_AROUND_YOU_KM,
            ),
          }
        : eventFilters,
    [section, eventFilters],
  );

  const eventList = useFilteredEvents(
    isEvent && !isTopRated ? coords : null,
    listFilters,
    window ?? undefined,
  );
  const topRated = useQuery({
    queryKey: [
      "explore",
      "event-top-rated",
      coords?.lat ?? 0,
      coords?.lng ?? 0,
      eventFilters,
    ],
    enabled: isTopRated && coords != null,
    queryFn: async () =>
      (
        await fetchExploreEventSections({
          lat: coords?.lat ?? 0,
          lng: coords?.lng ?? 0,
          filters: eventFilters,
          sections: ["topRatedOrganizers"],
          sectionSize: TOP_RATED_SIZE,
        })
      ).topRatedOrganizers,
  });
  const placeSliders = useExplorePlaceSliders(
    isEvent ? null : coords,
    placeFilters,
  );
  const placeCategories = usePlaceCategories().data ?? [];

  const events: UserPostType[] = isTopRated
    ? (topRated.data ?? [])
    : (eventList.data?.pages.flatMap((p) => p.rows) ?? []);
  const places: PlaceType[] = !isEvent
    ? (placeSliders.data[sliderKey as PlaceKey] ?? [])
    : [];

  const query = isEvent ? (isTopRated ? topRated : eventList) : placeSliders;
  const loading = query.isLoading;
  // Loading / offline / failed, told apart from "there is nothing here".
  const view = useQueryView<unknown>(
    query,
    () => (isEvent ? events : places).length === 0,
  );

  const filterCount = isEvent
    ? countActiveEventFilters(eventFilters)
    : countActivePlaceFilters(placeFilters);
  const selectedPlaceCategory =
    placeFilters.categoryId != null
      ? placeCategories.find((c) => c.id === placeFilters.categoryId)
      : undefined;
  const selectedPlaceCategoryName = selectedPlaceCategory
    ? placeCategoryLabel(i18n.t, selectedPlaceCategory)
    : null;
  const activeChips = isEvent
    ? describeEventFilters(
        i18n,
        eventFilters,
        market?.defaultCurrency ?? "",
        market?.priceScale ?? 1,
      )
    : describePlaceFilters(i18n, placeFilters, selectedPlaceCategoryName);

  const header = (
    <View>
      <AppHeader
        variant="title"
        title={title ?? t("all")}
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
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerClassName="gap-4 px-4 pb-16 pt-3"
          refreshControl={<Refresher onRefresh={() => query.refetch()} />}
          onEndReached={() => {
            if (
              !isTopRated &&
              eventList.hasNextPage &&
              !eventList.isFetchingNextPage
            ) {
              eventList.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            view.kind === "empty" ? (
              <EmptyState
                icon="calendar-outline"
                title={
                  filterCount > 0
                    ? t("noEventsMatchYourFilters")
                    : t("nothingHereRightNow")
                }
                description={
                  filterCount > 0
                    ? t("tryWideningOrClearingYourFilters")
                    : t("checkBackSoonOrChangeYour")
                }
                actionLabel={filterCount > 0 ? t("clearFilters") : undefined}
                onAction={filterCount > 0 ? clearEventFilters : undefined}
              />
            ) : (
              <QueryUnavailable
                view={view}
                subject={t("eventsHere")}
                onRetry={() => query.refetch()}
              />
            )
          }
          ListFooterComponent={
            isTopRated ? null : (
              <ListFooter
                count={events.length}
                isFetchingNextPage={eventList.isFetchingNextPage}
                hasNextPage={eventList.hasNextPage}
                isError={eventList.isFetchNextPageError}
                onRetry={() => eventList.fetchNextPage()}
              />
            )
          }
        />
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PlaceCard place={item} />}
          contentContainerClassName="gap-4 px-4 pb-16 pt-3"
          refreshControl={<Refresher onRefresh={() => query.refetch()} />}
          ListEmptyComponent={
            view.kind === "empty" ? (
              <EmptyState
                icon="location-outline"
                title={
                  filterCount > 0
                    ? t("noPlacesMatchYourFilters")
                    : t("nothingHereRightNow")
                }
                description={
                  filterCount > 0
                    ? t("tryWideningOrClearingYourFilters")
                    : t("checkBackSoonOrChangeYour")
                }
                actionLabel={filterCount > 0 ? t("clearFilters") : undefined}
                onAction={filterCount > 0 ? clearPlaceFilters : undefined}
              />
            ) : (
              <QueryUnavailable
                view={view}
                subject={t("placesHere")}
                onRetry={() => query.refetch()}
              />
            )
          }
        />
      )}
    </View>
  );
}
