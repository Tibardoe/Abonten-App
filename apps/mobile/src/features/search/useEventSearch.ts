import {
  EMPTY_EVENT_FILTERS,
  type EventFilters,
  countActiveEventFilters,
} from "@/features/discovery/exploreFilters";
import { fetchFilteredEventsPage } from "@/features/discovery/useFilteredEvents";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const MIN_QUERY_LEN = 2;

type Cursor = { startsAt: string; distanceKm: number; id: string };

export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

// The older events search (the list the Search screen falls back to when
// unified search is off): the same `get_filtered_events` call as the Explore
// "All events" list, with the typed text and no area. Cursor kept in memory.
// `filters` is the Search screen's Filter-sheet state (defaults to "no
// filters"); the filters mean here exactly what they mean on Explore.
export function useEventSearch(
  query: string,
  filters: EventFilters = EMPTY_EVENT_FILTERS,
) {
  const text = query.trim();
  return useInfiniteQuery({
    queryKey: ["mobile", "search", "events", text, filters],
    // A query OR at least one active filter is enough to run — the web
    // /search route likewise lists filtered events with no free-text term.
    enabled:
      text.length >= MIN_QUERY_LEN || countActiveEventFilters(filters) > 0,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) =>
      fetchFilteredEventsPage(null, filters, pageParam, { searchText: text }),
    getNextPageParam: (last) => last.nextCursor,
  });
}
