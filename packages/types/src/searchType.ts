// Unified search (Discovery). One vocabulary for web, mobile and the service
// layer. Row shapes mirror the search_events / search_places /
// search_organizers / search_suggest RPCs in
// supabase/migrations/20260913090000_search_v2_foundation.sql.

import type { PlaceType } from "./placeType";
import type { UserPostType } from "./postsType";

export type SearchEntityType = "event" | "place" | "organizer";

/** Which group(s) a results request asks for. `all` = the first page of each. */
export type SearchMode = "all" | "events" | "places" | "organizers";

export type SearchPlatform = "web" | "ios" | "android";

/** How a query was understood. `organizer` = it started with "@". */
export type SearchQueryKind = "text" | "organizer" | "empty";

export type ParsedSearchQuery = {
  kind: SearchQueryKind;
  /** Lower-cased, whitespace-collapsed, at most 120 characters. */
  normalized: string;
  /** For "@handle" queries: the handle without "@", else null. */
  handle: string | null;
};

export type SearchEventHit = UserPostType & {
  entityType: "event";
  score: number;
  isNew: boolean;
  organizerUsername: string | null;
  organizerVerified: boolean;
};

export type SearchPlaceHit = PlaceType & {
  entityType: "place";
  score: number;
  isNew: boolean;
};

export type SearchOrganizerHit = {
  entityType: "organizer";
  id: string;
  username: string;
  fullName: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | null;
  bio: string | null;
  verified: boolean;
  eventCount: number;
  upcomingCount: number;
  placeCount: number;
  avgRating: number | null;
  ratingCount: number;
  isNew: boolean;
  score: number;
};

export type SearchHit = SearchEventHit | SearchPlaceHit | SearchOrganizerHit;

export type SearchGroup<T> = {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
  /** Set when this group failed; the other groups are still returned. */
  error?: boolean;
};

/** Filters a results request may carry. Unknown for a group = ignored. */
export type SearchFilters = {
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number | null;
  category?: string | null;
  types?: string[] | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  minRating?: number | null;
  placeCategoryId?: number | null;
  openNow?: boolean | null;
  organizerId?: string | null;
};

export type SearchRequest = SearchFilters & {
  q: string;
  mode: SearchMode;
  /** Opaque cursor from a previous page; single-group modes only. */
  cursor?: string | null;
  pageSize?: number;
};

export type SearchResults = {
  status: number;
  message?: string;
  /** search_query_log row id, for click attribution. Null when not logged. */
  searchId: number | null;
  mode: SearchMode;
  query: ParsedSearchQuery;
  events: SearchGroup<SearchEventHit>;
  places: SearchGroup<SearchPlaceHit>;
  organizers: SearchGroup<SearchOrganizerHit>;
};

/** Cursor payload for every ranked search RPC: (score desc, id asc) + pinned time. */
export type SearchCursor = {
  score: number;
  id: string;
  asOf: string;
};

export type SearchSuggestion = {
  entityType: SearchEntityType;
  id: string;
  /** Event title, place name, or organizer username. */
  label: string;
  /** Event category, place category, or organizer full name. */
  sublabel: string | null;
  imagePublicId: string | null;
  imageVersion: string | null;
  /** Event or place slug; organizer username. */
  slug: string | null;
  eventCode: string | null;
  startsAt: string | null;
  distanceKm: number | null;
  verified: boolean;
};

export type SearchSuggestionsResponse = {
  status: number;
  message?: string;
  query: ParsedSearchQuery;
  events: SearchSuggestion[];
  places: SearchSuggestion[];
  organizers: SearchSuggestion[];
};

export type SearchClickInput = {
  searchId: number;
  entityType: SearchEntityType;
  entityId: string;
  rank: number;
};
