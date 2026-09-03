import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  type EventFilters,
  type PlaceFilters,
} from "./exploreFilters";

// The Explore screen's active filters, lifted out of the tab component so
// they survive the tab unmounting (switching to another tab and back) and
// are shared with the "See all" section screen (explore/[type]) — which
// must respect the same constraints the strip it expands was filtered by.
// Session-scoped only: filters intentionally reset on a cold app start,
// like a fresh browse.

type Ctx = {
  eventFilters: EventFilters;
  placeFilters: PlaceFilters;
  setEventFilters: (next: EventFilters) => void;
  setPlaceFilters: (next: PlaceFilters) => void;
  clearEventFilters: () => void;
  clearPlaceFilters: () => void;
};

const ExploreFiltersContext = createContext<Ctx | null>(null);

export function ExploreFiltersProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [eventFilters, setEventFilters] =
    useState<EventFilters>(EMPTY_EVENT_FILTERS);
  const [placeFilters, setPlaceFilters] =
    useState<PlaceFilters>(EMPTY_PLACE_FILTERS);

  const clearEventFilters = useCallback(
    () => setEventFilters(EMPTY_EVENT_FILTERS),
    [],
  );
  const clearPlaceFilters = useCallback(
    () => setPlaceFilters(EMPTY_PLACE_FILTERS),
    [],
  );

  const value = useMemo<Ctx>(
    () => ({
      eventFilters,
      placeFilters,
      setEventFilters,
      setPlaceFilters,
      clearEventFilters,
      clearPlaceFilters,
    }),
    [eventFilters, placeFilters, clearEventFilters, clearPlaceFilters],
  );

  return (
    <ExploreFiltersContext.Provider value={value}>
      {children}
    </ExploreFiltersContext.Provider>
  );
}

export function useExploreFilters(): Ctx {
  const ctx = useContext(ExploreFiltersContext);
  if (!ctx) {
    throw new Error(
      "useExploreFilters must be used within an ExploreFiltersProvider",
    );
  }
  return ctx;
}
