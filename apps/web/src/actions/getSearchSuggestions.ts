"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@/utils/logger";
import type {
  EventSuggestion,
  PlaceSuggestion,
  SearchSuggestionsResult,
} from "@abonten/types/searchSuggestionType";

const EVENT_SUGGESTION_LIMIT = 5;
const PLACE_SUGGESTION_LIMIT = 4;

// Backs the search bar's autocomplete dropdown (FilterSearchBar.tsx via
// useSearchSuggestions.ts) — deliberately separate from getQueriedEvents.ts /
// getQueriedPlaces.ts, which call the heavier get_filtered_events/
// get_filtered_places RPCs (rating/price/occurrence joins, full rows) meant
// for a results page, not a per-keystroke call. `includePlaces` is false on
// events-only routes (/search, /search/[searchTitle]) so the places RPC
// isn't called at all there.
export async function getSearchSuggestions(
  searchText: string,
  { includePlaces = true }: { includePlaces?: boolean } = {},
): Promise<SearchSuggestionsResult> {
  const trimmed = searchText.trim();
  if (!trimmed) {
    return { status: 200, events: [], places: [] };
  }

  const supabase = publicSupabase;

  const [eventsResponse, placesResponse] = await Promise.all([
    supabase.rpc("get_event_suggestions", {
      p_search_text: trimmed,
      p_limit: EVENT_SUGGESTION_LIMIT,
    }),
    includePlaces
      ? supabase.rpc("get_place_suggestions", {
          p_search_text: trimmed,
          p_limit: PLACE_SUGGESTION_LIMIT,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (eventsResponse.error) {
    logger.error("Error fetching event suggestions:", eventsResponse.error);
  }
  if (placesResponse.error) {
    logger.error("Error fetching place suggestions:", placesResponse.error);
  }

  return {
    status: 200,
    events: (eventsResponse.data ?? []) as EventSuggestion[],
    places: (placesResponse.data ?? []) as PlaceSuggestion[],
  };
}
