import { api } from "@/lib/api";
import {
  isSearchableQuery,
  parseSearchQuery,
} from "@abonten/core/search/parseSearchQuery";
import type {
  SearchMode,
  SearchResults,
  SearchSuggestionsResponse,
} from "@abonten/types/searchType";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useDebouncedValue } from "./useEventSearch";

// Unified search on mobile (Discovery). Type-ahead goes through
// GET /api/mobile/search/suggest and a submitted search through
// GET /api/mobile/search; both add rate limiting, the programme's switches
// and privacy-safe analytics (the server decides which groups to suggest).
// Earlier builds called the search_suggest RPC straight from the device,
// which nothing could rate-limit or count. The query is normalised on the
// device first so control characters never leave it.

export const SEARCH_SUGGEST_KEY = ["mobile", "search", "suggest"] as const;

export function useUnifiedSuggestions(
  raw: string,
  options: { types: string[] },
) {
  // `types` only keys the cache (a programme change refetches); the server
  // applies the same switches itself.
  const debounced = useDebouncedValue(raw, 300);
  const parsed = parseSearchQuery(debounced);
  const enabled = isSearchableQuery(parsed);

  const query = useQuery({
    queryKey: [
      ...SEARCH_SUGGEST_KEY,
      parsed.normalized,
      options.types.join(","),
    ],
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SearchSuggestionsResponse> => {
      const res = await api.search.suggest({ q: parsed.normalized });
      if (res.status !== 200) {
        throw new Error(res.message ?? "Suggestions failed");
      }
      return res;
    },
  });

  const data = enabled ? query.data : undefined;
  return {
    query: parsed.normalized,
    kind: parsed.kind,
    /** Reported with the suggestion opened (logSearchOpen). */
    searchId: data?.searchId ?? null,
    events: data?.events ?? [],
    places: data?.places ?? [],
    organizers: data?.organizers ?? [],
    isLoading: enabled && query.isFetching,
    isError: enabled && query.isError,
    hasQuery: enabled,
  };
}

export function useUnifiedResults(input: {
  q: string;
  mode: SearchMode;
  organizerId?: string | null;
  enabled: boolean;
}) {
  const q = parseSearchQuery(input.q).normalized;
  return useInfiniteQuery({
    queryKey: [
      "mobile",
      "search",
      "results",
      q,
      input.mode,
      input.organizerId ?? null,
    ],
    enabled: input.enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<SearchResults> => {
      const res = await api.search.query({
        q,
        mode: input.mode,
        organizerId: input.organizerId ?? undefined,
        cursor: pageParam ?? undefined,
      });
      if (res.status !== 200) throw new Error(res.message ?? "Search failed");
      return res;
    },
    getNextPageParam: (last) => {
      if (input.mode === "all") return null;
      const group =
        input.mode === "events"
          ? last.events
          : input.mode === "places"
            ? last.places
            : last.organizers;
      return group.hasNextPage ? group.nextCursor : null;
    },
    staleTime: 60_000,
  });
}

/** Reports the first result (or suggestion) opened from a search. Never throws. */
export function logSearchOpen(
  searchId: number | null,
  entityType: "event" | "place" | "organizer",
  entityId: string,
  rank: number,
) {
  if (!searchId) return;
  api.search.click({ searchId, entityType, entityId, rank }).catch(() => {});
}
