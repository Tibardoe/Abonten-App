"use client";

import { getSearchSuggestions } from "@/actions/getSearchSuggestions";
import { usePlaceCategories } from "@/hooks/usePlaceCategories";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import debounce from "lodash.debounce";
import { useEffect, useMemo, useState } from "react";

// Minimum characters before an autocomplete query fires — one keystroke is
// rarely a useful prefix and would just be a wasted round-trip, but waiting
// for a whole word would feel sluggish for a short input like "gym"/"jazz".
// Exported so FilterSearchBar.tsx can use the same threshold to decide
// between showing "recent searches" vs. live result groups.
export const MIN_SUGGESTION_QUERY_LENGTH = 2;
const MIN_QUERY_LENGTH = MIN_SUGGESTION_QUERY_LENGTH;
// Matches the debounce interval already established for typeahead in this
// codebase (usePlacesAutocomplete.ts, PlaceSearchSelect.tsx).
const DEBOUNCE_MS = 300;

export function useSearchSuggestions(query: string, includePlaces: boolean) {
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const updateDebouncedQuery = useMemo(
    () => debounce(setDebouncedQuery, DEBOUNCE_MS),
    [],
  );

  useEffect(() => {
    updateDebouncedQuery(query);
    return () => updateDebouncedQuery.cancel();
  }, [query, updateDebouncedQuery]);

  const trimmed = debouncedQuery.trim();

  const { data, isFetching } = useQuery({
    queryKey: ["search-suggestions", trimmed, includePlaces],
    queryFn: () => getSearchSuggestions(trimmed, { includePlaces }),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  // place_category is a small, near-static 14-row lookup table, read once
  // (hooks/usePlaceCategories.ts) and matched client-side against the
  // query, same as the hardcoded event category list, rather than
  // re-querying it per keystroke.
  const { data: placeCategoriesResult } = usePlaceCategories({
    enabled: includePlaces,
  });
  const placeCategories = placeCategoriesResult ?? [];

  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH;

  return {
    // The debounced, trimmed query these results actually correspond to —
    // lets a caller detect "still waiting for debounce to catch up with the
    // raw input" (raw !== query) and hold off on a "no matches" state until
    // then, instead of flashing one for the ~300ms debounce window.
    query: trimmed,
    events: hasQuery ? (data?.events ?? []) : [],
    places: hasQuery ? (data?.places ?? []) : [],
    placeCategories,
    // Only meaningful once the debounce has settled and a query is actually
    // enabled — avoids a loading flash while the user is still mid-keystroke.
    isLoading: hasQuery && isFetching,
    hasQuery,
  };
}
