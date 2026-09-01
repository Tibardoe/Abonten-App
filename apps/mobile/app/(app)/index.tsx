import { EventCard } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { ActiveFilterChips } from "@/components/explore/ActiveFilterChips";
import { CategoryChipsRow } from "@/components/explore/CategoryChipsRow";
import { ChangeLocationSheet } from "@/components/explore/ChangeLocationSheet";
import { FilterSheet } from "@/components/explore/FilterSheet";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import {
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  type EventFilters,
  type PlaceFilters,
  clearEventFilterKey,
  clearPlaceFilterKey,
  countActiveEventFilters,
  countActivePlaceFilters,
  describeEventFilters,
  describePlaceFilters,
} from "@/features/discovery/exploreFilters";
import { useFilteredEvents } from "@/features/discovery/useFilteredEvents";
import { useFilteredPlaces } from "@/features/discovery/useFilteredPlaces";
import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import {
  AppText,
  Caption,
  Chip,
  EmptyState,
  Icon,
  ScreenLoader,
  Spinner,
} from "@abonten/ui-native";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

type Tab = "events" | "places";

// The Explore screen — native equivalent of the web /explore/[location]
// page: a location switcher, Events/Places tabs, a category chip row, a
// filter sheet mirroring the web Filter modal, a removable active-filter
// chip row, and the filterable "All events" / "All places" list with
// filter-aware empty states. The web page's curated sliders (Featured,
// Around You, Happening Today/Week/Month, Top Rated) are a follow-up pass
// (docs/mobile/09).
export default function Explore() {
  const { location, resolving } = useExploreLocation();
  const coords = location ? { lat: location.lat, lng: location.lng } : null;

  const [tab, setTab] = useState<Tab>("events");
  const [eventFilters, setEventFilters] =
    useState<EventFilters>(EMPTY_EVENT_FILTERS);
  const [placeFilters, setPlaceFilters] =
    useState<PlaceFilters>(EMPTY_PLACE_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const placeCategoriesQuery = usePlaceCategories();
  const placeCategories = placeCategoriesQuery.data ?? [];

  const eventsQuery = useFilteredEvents(coords, eventFilters);
  const placesQuery = useFilteredPlaces(coords, placeFilters);

  const events: UserPostType[] =
    eventsQuery.data?.pages.flatMap((p) => p.rows) ?? [];
  const places: PlaceType[] =
    placesQuery.data?.pages.flatMap((p) => p.rows) ?? [];

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

  const activeCount =
    tab === "events"
      ? countActiveEventFilters(eventFilters)
      : countActivePlaceFilters(placeFilters);

  const onEndReached = useCallback(() => {
    const q = tab === "events" ? eventsQuery : placesQuery;
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [tab, eventsQuery, placesQuery]);

  function removeChip(key: string) {
    if (tab === "events") setEventFilters((f) => clearEventFilterKey(f, key));
    else setPlaceFilters((f) => clearPlaceFilterKey(f, key));
  }

  function clearAllChips() {
    if (tab === "events") setEventFilters(EMPTY_EVENT_FILTERS);
    else setPlaceFilters(EMPTY_PLACE_FILTERS);
  }

  if (resolving) return <ScreenLoader />;

  const activeQuery = tab === "events" ? eventsQuery : placesQuery;

  const listHeader = (
    <View>
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
            setEventFilters((f) => ({
              ...f,
              category: key,
              types: key ? f.types : [],
            }));
          } else {
            setPlaceFilters((f) => ({
              ...f,
              categoryId: key != null ? Number(key) : null,
            }));
          }
        }}
      />
      <ActiveFilterChips
        chips={activeChips}
        onRemove={removeChip}
        onClearAll={clearAllChips}
      />
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
          <AppText className="text-[13px] font-medium text-foreground">
            Filters
          </AppText>
          {activeCount > 0 ? (
            <View className="ml-0.5 min-w-[18px] items-center rounded-full bg-primary px-1">
              <AppText className="text-[11px] font-semibold text-primary-foreground">
                {activeCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* Events / Places tabs — the web ExploreTabs. */}
      <View className="flex-row gap-2 px-4 pb-1">
        <Chip
          label="Events"
          selected={tab === "events"}
          onPress={() => setTab("events")}
        />
        <Chip
          label="Places"
          selected={tab === "places"}
          onPress={() => setTab("places")}
        />
      </View>

      {location?.isFallback ? (
        <Caption className="px-4 pb-1">
          Showing {location.label} — set your location for nearby results.
        </Caption>
      ) : null}

      {tab === "events" ? (
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
              onRefresh={() => eventsQuery.refetch()}
            />
          }
          ListEmptyComponent={eventsQuery.isLoading ? <Spinner /> : emptyState}
          ListFooterComponent={
            eventsQuery.isFetchingNextPage ? <Spinner /> : null
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
              onRefresh={() => placesQuery.refetch()}
            />
          }
          ListEmptyComponent={placesQuery.isLoading ? <Spinner /> : emptyState}
          ListFooterComponent={
            placesQuery.isFetchingNextPage ? <Spinner /> : null
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
