import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  isSearchableQuery,
  parseSearchQuery,
} from "@abonten/core/search/parseSearchQuery";
import type {
  SearchMode,
  SearchResults,
  SearchSuggestion,
} from "@abonten/types/searchType";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useDebouncedValue } from "./useEventSearch";

// Unified search on mobile (Discovery). Type-ahead calls the anon
// search_suggest RPC straight from the device, which is the fastest path and
// exposes nothing that isn't public; a submitted search goes through
// GET /api/mobile/search, which adds rate limiting, the programme's switches
// and privacy-safe analytics. The query is normalised on the device first so
// control characters (a NUL cannot even reach Postgres) never leave it.

export const SEARCH_SUGGEST_KEY = ["mobile", "search", "suggest"] as const;

export function useUnifiedSuggestions(
  raw: string,
  options: { types: string[] },
) {
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
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_suggest", {
        p_query: parsed.normalized,
        p_types: options.types,
      });
      if (error) throw error;
      return (data ?? []).map(
        (row): SearchSuggestion => ({
          entityType: row.entity_type as SearchSuggestion["entityType"],
          id: row.id,
          label: row.label,
          sublabel: row.sublabel ?? null,
          imagePublicId: row.image_public_id ?? null,
          imageVersion: row.image_version ?? null,
          slug: row.slug ?? null,
          eventCode: row.event_code ?? null,
          startsAt: row.starts_at ?? null,
          distanceKm: row.distance_km ?? null,
          verified: !!row.verified,
        }),
      );
    },
  });

  const rows = enabled ? (query.data ?? []) : [];
  return {
    query: parsed.normalized,
    kind: parsed.kind,
    events: rows.filter((r) => r.entityType === "event"),
    places: rows.filter((r) => r.entityType === "place"),
    organizers: rows.filter((r) => r.entityType === "organizer"),
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

/** Reports the first result opened from a search. Never throws. */
export function logSearchOpen(
  searchId: number | null,
  entityType: "event" | "place" | "organizer",
  entityId: string,
  rank: number,
) {
  if (!searchId) return;
  api.search.click({ searchId, entityType, entityId, rank }).catch(() => {});
}
