export type PaginatedResult<T> = {
  status: number;
  data: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
  message?: string;
};

// Cursor payloads per RPC — the field set each rewritten RPC needs to resume
// ordering deterministically. Encoded/decoded via src/utils/pagination.ts.
export type NearbyEventsCursor = {
  sortKey: string; // ISO timestamp — the RPC's computed "next relevant occurrence" sort key
  id: string;
};

export type FilteredEventsCursor = {
  startsAt: string; // ISO timestamp — COALESCE(next occurrence starts_at, event.starts_at)
  distanceKm: number;
  id: string;
};

export type EventsInWindowCursor = {
  startsAt: string; // ISO timestamp — the matched in-window occurrence starts_at
  id: string;
};

// Shared by the plain-table (non-RPC) lists — favorites, posts, organizer
// events, tickets, reviews, transactions, attendees — all of which order by
// a real `created_at`/`transaction_date` column plus a unique id tiebreak,
// with no computed sort column involved (unlike the events RPCs above).
export type SimpleCursor = {
  sortValue: string; // ISO timestamp of whichever column the list orders by
  id: string;
};

// get_nearby_places / get_filtered_places (Places feature) both order by
// (distance_km, id) — see 20260820090000_add_places_feature.sql. Unlike
// FilteredEventsCursor, there's no starts_at to also carry: places have no
// schedule.
export type PlacesCursor = {
  distanceKm: number;
  id: string;
};
