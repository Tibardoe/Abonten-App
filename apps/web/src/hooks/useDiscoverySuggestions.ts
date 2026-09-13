"use client";

import { suggestDiscovery } from "@/actions/discovery/suggestDiscovery";
import {
  isSearchableQuery,
  parseSearchQuery,
} from "@abonten/core/search/parseSearchQuery";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import debounce from "lodash.debounce";
import { useEffect, useMemo, useState } from "react";

// Type-ahead for the unified search bar: events, places and organizers in
// one round trip ("@" narrows to organizers). Same 300 ms debounce as the
// legacy useSearchSuggestions; superseded requests are simply ignored by
// React Query because the key changes with every debounced query.
const DEBOUNCE_MS = 300;

export function useDiscoverySuggestions(raw: string, enabled: boolean) {
  const [debounced, setDebounced] = useState("");
  const update = useMemo(() => debounce(setDebounced, DEBOUNCE_MS), []);

  useEffect(() => {
    update(raw);
    return () => update.cancel();
  }, [raw, update]);

  const parsed = parseSearchQuery(debounced);
  const searchable = enabled && isSearchableQuery(parsed);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["discovery-suggestions", parsed.normalized],
    queryFn: () => suggestDiscovery({ q: parsed.normalized }),
    enabled: searchable,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const ok = searchable && data?.status === 200;
  return {
    /** The normalised query these results belong to. */
    query: parsed.normalized,
    kind: parsed.kind,
    events: ok ? data.events : [],
    places: ok ? data.places : [],
    organizers: ok ? data.organizers : [],
    isLoading: searchable && isFetching,
    isError: searchable && (isError || (!!data && data.status >= 500)),
    hasQuery: searchable,
  };
}
