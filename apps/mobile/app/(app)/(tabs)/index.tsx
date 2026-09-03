import { EventCard, EventCardSkeleton } from "@/components/EventCard";
import { PlaceCard, PlaceCardSkeleton } from "@/components/PlaceCard";
import { AppHeader } from "@/components/app/AppHeader";
import { ActiveFilterChips } from "@/components/explore/ActiveFilterChips";
import { CategoryChipsRow } from "@/components/explore/CategoryChipsRow";
import { ChangeLocationSheet } from "@/components/explore/ChangeLocationSheet";
import { ExploreMap } from "@/components/explore/ExploreMap";
import {
  EventSliderRow,
  PlaceSliderRow,
} from "@/components/explore/ExploreSliderRow";
import { FeaturedEventsCarousel } from "@/components/explore/FeaturedEventsCarousel";
import { FeaturedPlacesCarousel } from "@/components/explore/FeaturedPlacesCarousel";
import { FilterSheet } from "@/components/explore/FilterSheet";
import { useExploreFilters } from "@/features/discovery/ExploreFiltersProvider";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import {
  clearEventFilterKey,
  clearPlaceFilterKey,
  countActiveEventFilters,
  countActivePlaceFilters,
  describeEventFilters,
  describePlaceFilters,
  eventFiltersNeedServerData,
  filterEventList,
  filterPlaceList,
} from "@/features/discovery/exploreFilters";
import { useExploreEventSliders } from "@/features/discovery/useExploreEventSliders";
import { useExplorePlaceSliders } from "@/features/discovery/useExplorePlaceSliders";
import { useFilteredEvents } from "@/features/discovery/useFilteredEvents";
import { useFilteredPlaces } from "@/features/discovery/useFilteredPlaces";
import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import {
  AppText,
  Caption,
  EmptyState,
  Icon,
  ListFooter,
  ScreenLoader,
  SectionTitle,
  SegmentedTabs,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

type Tab = "events" | "places";

// The Explore screen — native equivalent of the web /explore/[location]
// page: a location switcher, Events/Places tabs, a category chip row, a
// filter sheet mirroring the web Filter modal, a removable active-filter
// chip row, the curated sliders (Featured / Around You / Happening
// Today-Week-Month / Top Rated), and the filterable "All events" / "All
// places" list with filter-aware empty states.
export default function Explore() {
  const router = useRouter();
  const { location, resolving } = useExploreLocation();
  const coords = location ? { lat: location.lat, lng: location.lng } : null;

  const openSection = useCallback(
    (kind: "event" | "place", sliderKey: string, title: string) => {
      router.push({
        pathname: "/(app)/explore/[type]",
        params: { type: sliderKey, kind, title },
      });
    },
    [router],
  );

  const [tab, setTab] = useState<Tab>("events");
  const [view, setView] = useState<"list" | "map">("list");
  const {
    eventFilters,
    placeFilters,
    setEventFilters,
    setPlaceFilters,
    clearEventFilters,
    clearPlaceFilters,
  } = useExploreFilters();
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const placeCategoriesQuery = usePlaceCategories();
  const placeCategories = placeCategoriesQuery.data ?? [];

  const eventsQuery = useFilteredEvents(coords, eventFilters);
  const placesQuery = useFilteredPlaces(coords, placeFilters);

  const eventSliders = useExploreEventSliders(coords, location?.label ?? "");
  const placeSliders = useExplorePlaceSliders(coords);

  const events: UserPostType[] =
    eventsQuery.data?.pages.flatMap((p) => p.rows) ?? [];
  const places: PlaceType[] =
    placesQuery.data?.pages.flatMap((p) => p.rows) ?? [];

  // The filter sheet feeds every relevant section, not just the "All" list:
  // each curated slider is client-filtered against the same nearby fetch it
  // was already derived from (no extra network). A slider that ends up empty
  // is hidden further down; when a rating filter is set — a dimension the
  // events payload can't express — the whole curated block collapses and the
  // rating-aware "All" list carries the screen.
  const eventFilterCount = countActiveEventFilters(eventFilters);
  const placeFilterCount = countActivePlaceFilters(placeFilters);
  const curatedEventsSuppressed = eventFiltersNeedServerData(eventFilters);

  const eventSlidersFiltered = useMemo(() => {
    const d = eventSliders.data;
    if (eventFilterCount === 0) return d;
    const f = (list: UserPostType[]) =>
      filterEventList(list, eventFilters, coords);
    return {
      featured: f(d.featured),
      aroundYou: f(d.aroundYou),
      topRatedOrganizers: f(d.topRatedOrganizers),
      happeningToday: f(d.happeningToday),
      happeningThisWeek: f(d.happeningThisWeek),
      happeningThisMonth: f(d.happeningThisMonth),
    };
  }, [eventSliders.data, eventFilters, eventFilterCount, coords]);

  const placeSlidersFiltered = useMemo(() => {
    const d = placeSliders.data;
    if (placeFilterCount === 0) return d;
    const f = (list: PlaceType[]) => filterPlaceList(list, placeFilters);
    return {
      featured: f(d.featured),
      aroundYou: f(d.aroundYou),
      openNow: f(d.openNow),
      topRated: f(d.topRated),
    };
  }, [placeSliders.data, placeFilters, placeFilterCount]);

  const eventCategoryChips = useMemo(
    () =>
      eventCategoriesAndTypes.map((c) => ({
        key: c.category,
        label: c.category,
      })),
    [],
  );
  const placeCategoryChips = useMemo(
    () => placeCategories.map((c) => ({ key: String(c.id), label: c.name })),
    [placeCategories],
  );

  const selectedPlaceCategoryName =
    placeFilters.categoryId != null
      ? (placeCategories.find((c) => c.id === placeFilters.categoryId)?.name ??
        null)
      : null;

  const activeChips =
    tab === "events"
      ? describeEventFilters(eventFilters)
      : describePlaceFilters(placeFilters, selectedPlaceCategoryName);

  const activeCount = tab === "events" ? eventFilterCount : placeFilterCount;

  const onEndReached = useCallback(() => {
    const q = tab === "events" ? eventsQuery : placesQuery;
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [tab, eventsQuery, placesQuery]);

  function removeChip(key: string) {
    if (tab === "events")
      setEventFilters(clearEventFilterKey(eventFilters, key));
    else setPlaceFilters(clearPlaceFilterKey(placeFilters, key));
  }

  function clearAllChips() {
    if (tab === "events") clearEventFilters();
    else clearPlaceFilters();
  }

  if (resolving) return <ScreenLoader />;

  const activeQuery = tab === "events" ? eventsQuery : placesQuery;

  const eventCuratedEmpty =
    eventFilterCount > 0 &&
    !curatedEventsSuppressed &&
    eventSlidersFiltered.featured.length === 0 &&
    eventSlidersFiltered.aroundYou.length === 0 &&
    eventSlidersFiltered.topRatedOrganizers.length === 0 &&
    eventSlidersFiltered.happeningToday.length === 0 &&
    eventSlidersFiltered.happeningThisWeek.length === 0 &&
    eventSlidersFiltered.happeningThisMonth.length === 0;

  const placeCuratedEmpty =
    placeFilterCount > 0 &&
    placeSlidersFiltered.featured.length === 0 &&
    placeSlidersFiltered.aroundYou.length === 0 &&
    placeSlidersFiltered.openNow.length === 0 &&
    placeSlidersFiltered.topRated.length === 0;

  const sliders =
    tab === "events" ? (
      curatedEventsSuppressed ? (
        <Caption className="px-4 pt-4">
          Rating filter applied — showing the full matching list below.
        </Caption>
      ) : eventCuratedEmpty ? null : (
        <View>
          {eventSlidersFiltered.featured.length > 0 ? (
            <View className="gap-2 pt-4">
              <SectionTitle className="px-4">Featured</SectionTitle>
              <FeaturedEventsCarousel events={eventSlidersFiltered.featured} />
            </View>
          ) : null}
          <EventSliderRow
            title="Around you"
            events={eventSlidersFiltered.aroundYou}
            onViewAll={() => openSection("event", "aroundYou", "Around you")}
          />
          <EventSliderRow
            title="Top-rated organizers"
            events={eventSlidersFiltered.topRatedOrganizers}
            onViewAll={() =>
              openSection("event", "topRatedOrganizers", "Top-rated organizers")
            }
          />
          <EventSliderRow
            title="Happening today"
            events={eventSlidersFiltered.happeningToday}
            onViewAll={() =>
              openSection("event", "happeningToday", "Happening today")
            }
          />
          <EventSliderRow
            title="Happening this week"
            events={eventSlidersFiltered.happeningThisWeek}
            onViewAll={() =>
              openSection("event", "happeningThisWeek", "Happening this week")
            }
          />
          <EventSliderRow
            title="Happening this month"
            events={eventSlidersFiltered.happeningThisMonth}
            onViewAll={() =>
              openSection("event", "happeningThisMonth", "Happening this month")
            }
          />
        </View>
      )
    ) : placeCuratedEmpty ? null : (
      <View>
        {placeSlidersFiltered.featured.length > 0 ? (
          <View className="gap-2 pt-4">
            <SectionTitle className="px-4">Featured</SectionTitle>
            <FeaturedPlacesCarousel places={placeSlidersFiltered.featured} />
          </View>
        ) : null}
        <PlaceSliderRow
          title="Around you"
          places={placeSlidersFiltered.aroundYou}
          onViewAll={() => openSection("place", "aroundYou", "Around you")}
        />
        <PlaceSliderRow
          title="Open now"
          places={placeSlidersFiltered.openNow}
          onViewAll={() => openSection("place", "openNow", "Open now")}
        />
        <PlaceSliderRow
          title="Top rated"
          places={placeSlidersFiltered.topRated}
          onViewAll={() => openSection("place", "topRated", "Top rated")}
        />
      </View>
    );

  const listHeader = (
    <View>
      {sliders}

      <CategoryChipsRow
        items={tab === "events" ? eventCategoryChips : placeCategoryChips}
        selectedKey={
          tab === "events"
            ? eventFilters.category
            : placeFilters.categoryId != null
              ? String(placeFilters.categoryId)
              : null
        }
        onSelect={(key) => {
          if (tab === "events") {
            setEventFilters({
              ...eventFilters,
              category: key,
              types: key ? eventFilters.types : [],
            });
          } else {
            setPlaceFilters({
              ...placeFilters,
              categoryId: key != null ? Number(key) : null,
            });
          }
        }}
      />
      <ActiveFilterChips
        chips={activeChips}
        onRemove={removeChip}
        onClearAll={clearAllChips}
      />
      <SectionTitle className="px-4 pb-1 pt-2">
        {tab === "events" ? "All events" : "All places"}
      </SectionTitle>
    </View>
  );

  const emptyState = (
    <EmptyState
      icon={tab === "events" ? "calendar-outline" : "location-outline"}
      title={
        activeQuery.isError
          ? `Couldn't load ${tab}`
          : activeCount > 0
            ? `No ${tab} match your filters`
            : `No ${tab} in ${location?.label ?? "this area"}`
      }
      description={
        activeQuery.isError
          ? "Pull down to try again."
          : activeCount > 0
            ? "Try widening or clearing your filters."
            : "Check back soon, or change your location."
      }
      actionLabel={activeCount > 0 ? "Clear filters" : undefined}
      onAction={activeCount > 0 ? clearAllChips : undefined}
    />
  );

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="branded" />
      {/* Location switcher — the web LocationAndFilterSection's location
          button. */}
      <View className="flex-row items-center justify-between gap-2 px-4 pb-2 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change location"
          onPress={() => setLocationOpen(true)}
          className="flex-row items-center gap-1 active:opacity-70"
        >
          <Icon name="location-outline" size={20} tone="foreground" />
          <AppText variant="bodyStrong" numberOfLines={1}>
            {location?.label ?? "Set location"}
          </AppText>
          <Icon name="chevron-down" size={16} tone="muted" />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            activeCount > 0 ? `Filters (${activeCount} active)` : "Filters"
          }
          onPress={() => setFilterOpen(true)}
          className="flex-row items-center gap-1 rounded-lg border border-border px-3 py-1.5 active:opacity-70"
        >
          <Icon name="options-outline" size={18} tone="foreground" />
          <AppText variant="small" className="font-medium">
            Filters
          </AppText>
          {activeCount > 0 ? (
            <View className="ml-0.5 min-w-[18px] items-center rounded-full bg-primary px-1">
              <AppText className="text-[13px] font-semibold text-primary-foreground">
                {activeCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Events / Places tabs — same segmented control as the web
          ExploreTabs (shadcn Tabs): full-width track, active segment lifted
          onto a bg-accent surface. */}
      <View className="px-4 pb-1">
        <SegmentedTabs
          options={[
            { key: "events", label: "Events" },
            { key: "places", label: "Places" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {/* List / Map view toggle — the web EventsTabContent's list-vs-map
          switch, kept as a compact right-aligned control. */}
      <View className="flex-row justify-end px-4 pb-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view === "list" ? "Show map" : "Show list"}
          onPress={() => setView((v) => (v === "list" ? "map" : "list"))}
          className="min-h-[36px] flex-row items-center gap-1 rounded-lg border border-border px-3 py-1.5 active:opacity-70"
        >
          <Icon
            name={view === "list" ? "map-outline" : "list-outline"}
            size={18}
            tone="foreground"
          />
          <AppText variant="small" className="font-medium">
            {view === "list" ? "Map" : "List"}
          </AppText>
        </Pressable>
      </View>

      {location?.isFallback ? (
        <Caption className="px-4 pb-1">
          Showing {location.label} — set your location for nearby results.
        </Caption>
      ) : null}

      {view === "map" ? (
        <ExploreMap
          kind={tab}
          events={events}
          places={places}
          center={coords}
        />
      ) : tab === "events" ? (
        <FlatList
          key="events"
          data={events}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventCard event={item} />}
          ListHeaderComponent={listHeader}
          contentContainerClassName="gap-4 pb-16"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={
                eventsQuery.isRefetching && !eventsQuery.isFetchingNextPage
              }
              onRefresh={() => {
                eventsQuery.refetch();
                eventSliders.refetch();
              }}
            />
          }
          ListEmptyComponent={
            eventsQuery.isLoading ? (
              <View className="gap-4 px-4 pt-2">
                {["a", "b", "c"].map((k) => (
                  <EventCardSkeleton key={k} />
                ))}
              </View>
            ) : (
              emptyState
            )
          }
          ListFooterComponent={
            <ListFooter
              count={events.length}
              isFetchingNextPage={eventsQuery.isFetchingNextPage}
              hasNextPage={eventsQuery.hasNextPage}
              isError={eventsQuery.isError}
              onRetry={() => eventsQuery.fetchNextPage()}
            />
          }
        />
      ) : (
        <FlatList
          key="places"
          data={places}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PlaceCard place={item} />}
          ListHeaderComponent={listHeader}
          contentContainerClassName="gap-4 pb-16"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={
                placesQuery.isRefetching && !placesQuery.isFetchingNextPage
              }
              onRefresh={() => {
                placesQuery.refetch();
                placeSliders.refetch();
              }}
            />
          }
          ListEmptyComponent={
            placesQuery.isLoading ? (
              <View className="gap-4 px-4 pt-2">
                {["a", "b", "c"].map((k) => (
                  <PlaceCardSkeleton key={k} />
                ))}
              </View>
            ) : (
              emptyState
            )
          }
          ListFooterComponent={
            <ListFooter
              count={places.length}
              isFetchingNextPage={placesQuery.isFetchingNextPage}
              hasNextPage={placesQuery.hasNextPage}
              isError={placesQuery.isError}
              onRetry={() => placesQuery.fetchNextPage()}
            />
          }
        />
      )}

      <ChangeLocationSheet
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
      />
      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        tab={tab}
        eventFilters={eventFilters}
        placeFilters={placeFilters}
        placeCategories={placeCategories}
        onApplyEvents={setEventFilters}
        onApplyPlaces={setPlaceFilters}
      />
    </View>
  );
}
