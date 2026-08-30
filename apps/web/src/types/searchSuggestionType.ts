// Row shapes returned by get_event_suggestions / get_place_suggestions (see
// supabase/migrations/20260902090000_add_search_suggestions.sql). Deliberately
// narrower than UserPostType/PlaceType — only the fields the autocomplete
// dropdown needs to render a row and navigate on selection.

export type EventSuggestion = {
  id: string;
  title: string;
  slug: string;
  event_code: string;
  event_category: string;
  flyer_public_id: string | null;
  flyer_version: string | null;
  starts_at: string;
};

export type PlaceSuggestion = {
  id: string;
  name: string;
  slug: string;
  category_id: number | null;
  cover_public_id: string | null;
  cover_version: string | null;
};

export type SearchSuggestionsResult = {
  status: number;
  events: EventSuggestion[];
  places: PlaceSuggestion[];
};

// Flattened, orderable list item for the dropdown — one shape covering every
// group so keyboard navigation (arrow up/down, Enter) can walk a single flat
// list while SearchSuggestionsDropdown.tsx still renders them grouped.
export type SuggestionItem =
  | { kind: "event"; key: string; event: EventSuggestion }
  | { kind: "place"; key: string; place: PlaceSuggestion }
  | { kind: "eventCategory"; key: string; category: string }
  | {
      kind: "placeCategory";
      key: string;
      category: { id: number; name: string };
    }
  | { kind: "recent"; key: string; text: string }
  | { kind: "literal"; key: string; text: string };

export type SuggestionSection = {
  label: string;
  items: SuggestionItem[];
};
