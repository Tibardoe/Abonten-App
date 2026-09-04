import { supabase } from "@/lib/supabase";
import type { Database } from "@abonten/types/database.types";
import type { UserPostType } from "@abonten/types/postsType";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { EventFilters } from "./exploreFilters";
import { PRICE_ANY_MAX } from "./exploreFilters";

// get_filtered_events' generated Args type marks most filter params as
// required (non-null) -- its live SQL signature genuinely lacks
// `DEFAULT NULL` on them, unlike its sibling get_filtered_places (which has
// defaults on the equivalent params). Postgres already accepts an explicit
// null for any parameter regardless of whether it has a default (defaults
// only matter for OMITTED args), and this app has always called it that way
// for "no filter" -- so this is a generated-type gap, not a real runtime
// constraint. Fixing get_filtered_events' SQL signature to match
// get_filtered_places' would remove the need for this cast, but that's a
// database change, flagged separately (docs/audit) rather than made here.
type GetFilteredEventsArgs =
  Database["public"]["Functions"]["get_filtered_events"]["Args"];

const PAGE_SIZE = 20;
// JSON-safe stand-in for "no distance" — matches getQueriedEvents /
// useEventSearch.
const NO_DISTANCE = 1e18;

// get_filtered_events' distance clause is
// `ST_DWithin(location, point, p_max_distance_km * 1000)` — when coords are
// given but p_max_distance_km is null, `null * 1000` is null and ST_DWithin
// returns null, so the whole row is filtered out and "All events" comes back
// empty even though the curated sliders (a separate 10km get_nearby_events
// call) are full. Web never hits this because EventsTabContent always passes
// `maxDistanceKm ?? EXPLORE_EVENTS_RADIUS_KM` (10). Match that here: the
// Filter sheet's Distance field overrides it when set.
const DEFAULT_RADIUS_KM = 10;

type Cursor = { startsAt: string; distanceKm: number; id: string };

async function fetchPage(
  coords: { lat: number; lng: number } | null,
  f: EventFilters,
  cursor: Cursor | null,
): Promise<{ rows: UserPostType[]; nextCursor: Cursor | null }> {
  // get_filtered_events' p_event_type is text[] and matches on ANY selected
  // type; pass null (not []) for "no filter" so the RPC's null short-circuit
  // applies — same as getQueriedEvents.
  const normalizedType = f.types.length > 0 ? f.types : null;
  const maxPrice =
    f.maxPrice != null && f.maxPrice < PRICE_ANY_MAX ? f.maxPrice : null;

  const { data, error } = await supabase.rpc("get_filtered_events", {
    p_min_price: f.minPrice,
    p_max_price: maxPrice,
    p_min_rating: f.minRating,
    p_user_lat: coords?.lat ?? null,
    p_user_lng: coords?.lng ?? null,
    p_max_distance_km: f.maxDistanceKm ?? DEFAULT_RADIUS_KM,
    p_start_date: f.startDate,
    p_end_date: f.endDate,
    p_search_text: "",
    p_event_category: f.category ?? "",
    p_event_type: normalizedType,
    p_cursor_starts_at: cursor?.startsAt ?? null,
    p_cursor_distance_km: cursor?.distanceKm ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_page_size: PAGE_SIZE + 1,
  } as GetFilteredEventsArgs);

  if (error) throw error;

  // Same RPC-to-app-model translation boundary as the other discovery
  // hooks -- get_filtered_events' real return columns don't exactly match
  // UserPostType's shape.
  const all = (data ?? []) as unknown as UserPostType[];
  const hasNext = all.length > PAGE_SIZE;
  const rows = hasNext ? all.slice(0, PAGE_SIZE) : all;
  const last = rows[rows.length - 1];

  return {
    rows,
    nextCursor:
      hasNext && last
        ? {
            startsAt: String(last.starts_at),
            distanceKm: last.distance_km ?? NO_DISTANCE,
            id: last.id,
          }
        : null,
  };
}

// The Explore "All Events" list — direct `supabase.rpc("get_filtered_events")`
// (anon-granted, same call the getQueriedEvents Server Action makes on web).
// In-memory cursor, no Node Buffer dependency.
export function useFilteredEvents(
  coords: { lat: number; lng: number } | null,
  filters: EventFilters,
) {
  return useInfiniteQuery({
    queryKey: [
      "explore",
      "events",
      coords?.lat ?? 0,
      coords?.lng ?? 0,
      filters,
    ],
    enabled: coords != null,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(coords, filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
