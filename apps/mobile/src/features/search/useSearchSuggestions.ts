import { supabase } from "@/lib/supabase";
import type { EventSuggestion } from "@abonten/types/searchSuggestionType";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "./useEventSearch";

// Native echo of apps/web/src/hooks/useSearchSuggestions.ts. The web action
// (getSearchSuggestions) calls the anon-granted get_event_suggestions /
// get_place_suggestions RPCs via the public client; the Search screen here
// is events-only (same as the web /search route, includePlaces: false), so
// this hits get_event_suggestions directly — the same direct-RPC pattern
// useEventSearch already uses for the results list.

export const MIN_SUGGESTION_QUERY_LENGTH = 2;
const EVENT_SUGGESTION_LIMIT = 6;

export function useSearchSuggestions(rawQuery: string) {
  const debounced = useDebouncedValue(rawQuery, 300);
  const trimmed = debounced.trim();
  const hasQuery = trimmed.length >= MIN_SUGGESTION_QUERY_LENGTH;

  const query = useQuery({
    queryKey: ["mobile", "search-suggestions", trimmed],
    enabled: hasQuery,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_event_suggestions", {
        p_search_text: trimmed,
        p_limit: EVENT_SUGGESTION_LIMIT,
      });
      if (error) throw error;
      return (data ?? []) as EventSuggestion[];
    },
  });

  return {
    // The debounced/trimmed query these results correspond to — lets the
    // caller hold off on a "no matches" state while the debounce catches up.
    query: trimmed,
    events: hasQuery ? (query.data ?? []) : [],
    isLoading: hasQuery && query.isFetching,
    isError: query.isError,
    hasQuery,
  };
}
