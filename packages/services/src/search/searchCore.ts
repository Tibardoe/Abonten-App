import { logger } from "@abonten/core/logger";
import { decodeCursor, encodeCursor } from "@abonten/core/pagination";
import {
  isSearchableQuery,
  parseSearchQuery,
} from "@abonten/core/search/parseSearchQuery";
import type { Database } from "@abonten/types/database.types";
import type { DiscoveryProgram } from "@abonten/types/discoveryType";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import type {
  ParsedSearchQuery,
  SearchClickInput,
  SearchCursor,
  SearchEventHit,
  SearchGroup,
  SearchOrganizerHit,
  SearchPlaceHit,
  SearchPlatform,
  SearchRequest,
  SearchResults,
  SearchSuggestion,
  SearchSuggestionsResponse,
} from "@abonten/types/searchType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Unified search across events, places and organizers (Discovery). The
// ranking lives in the database (search_events / search_places /
// search_organizers / search_suggest); this module decides which groups run
// for a request, pages them, maps rows to the shared result model and logs
// the search without personal identifiers.
//
// `client` only needs EXECUTE on the public search RPCs, so the web's
// cookie-free public client, a mobile Bearer client or the service role all
// work. Logging always uses the service role.

type EventRow =
  Database["public"]["Functions"]["search_events"]["Returns"][number];
type PlaceRow =
  Database["public"]["Functions"]["search_places"]["Returns"][number];
type OrganizerRow =
  Database["public"]["Functions"]["search_organizers"]["Returns"][number];
type SuggestRow =
  Database["public"]["Functions"]["search_suggest"]["Returns"][number];

export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGE_SIZE = 50;
/** First-screen sizes when every group is shown together. */
export const SEARCH_ALL_SIZES = { events: 6, places: 4, organizers: 4 };

const emptyGroup = <T>(): SearchGroup<T> => ({
  items: [],
  nextCursor: null,
  hasNextPage: false,
});

type GroupPage<Row> = {
  rows: Row[];
  hasNextPage: boolean;
  next: SearchCursor | null;
};

function page<Row extends { id: string; score: number; as_of: string }>(
  data: Row[] | null,
  size: number,
): GroupPage<Row> {
  const all = data ?? [];
  const hasNextPage = all.length > size;
  const rows = hasNextPage ? all.slice(0, size) : all;
  const last = rows[rows.length - 1];
  return {
    rows,
    hasNextPage,
    next:
      hasNextPage && last
        ? { score: Number(last.score), id: last.id, asOf: String(last.as_of) }
        : null,
  };
}

function toEventHit(row: EventRow): SearchEventHit {
  return {
    ...(row as unknown as UserPostType),
    address: (row.address ?? { full_address: "" }) as { full_address: string },
    location: row.location as unknown as string,
    entityType: "event",
    score: Number(row.score),
    isNew: row.is_new,
    organizerUsername: row.organizer_username ?? null,
    organizerVerified: row.organizer_verified,
  };
}

function toPlaceHit(row: PlaceRow): SearchPlaceHit {
  return {
    ...(row as unknown as PlaceType),
    entityType: "place",
    score: Number(row.score),
    isNew: row.is_new,
  };
}

function toOrganizerHit(row: OrganizerRow): SearchOrganizerHit {
  return {
    entityType: "organizer",
    id: row.id,
    username: row.username,
    fullName: row.full_name ?? null,
    avatarPublicId: row.avatar_public_id ?? null,
    avatarVersion: row.avatar_version ?? null,
    bio: row.bio ?? null,
    verified: row.organizer_verified,
    eventCount: Number(row.event_count),
    upcomingCount: Number(row.upcoming_count),
    placeCount: Number(row.place_count),
    avgRating: row.avg_rating == null ? null : Number(row.avg_rating),
    ratingCount: Number(row.rating_count),
    isNew: row.is_new,
    score: Number(row.score),
  };
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPageSize(size: number | undefined, fallback: number): number {
  const n = Math.trunc(size ?? fallback);
  return Math.min(
    Math.max(Number.isFinite(n) ? n : fallback, 1),
    SEARCH_MAX_PAGE_SIZE,
  );
}

function hasEventFilters(input: SearchRequest): boolean {
  return (
    input.minPrice != null ||
    input.maxPrice != null ||
    !!input.startDate ||
    !!input.endDate ||
    input.minRating != null ||
    (input.types?.length ?? 0) > 0 ||
    !!input.category ||
    input.radiusKm != null
  );
}

export type SearchOptions = {
  program: DiscoveryProgram;
  platform: SearchPlatform;
  /** Record the search in search_query_log (programme setting permitting). */
  log: boolean;
  /** Result of the programme's search_logging_enabled switch. */
  loggingEnabled: boolean;
};

export async function searchCore(
  client: SupabaseClient<Database>,
  input: SearchRequest,
  options: SearchOptions,
): Promise<SearchResults> {
  const started = Date.now();
  const query = parseSearchQuery(input.q);
  const base: SearchResults = {
    status: 200,
    searchId: null,
    mode: input.mode,
    query,
    events: emptyGroup(),
    places: emptyGroup(),
    organizers: emptyGroup(),
  };

  if (!options.program.searchV2) {
    return { ...base, status: 403, message: "Search is not available." };
  }

  const lat = finite(input.lat);
  const lng = finite(input.lng);
  const hasLocation = lat !== null && lng !== null;
  const cursor =
    input.mode === "all" ? null : decodeCursor<SearchCursor>(input.cursor);
  const organizerMode = query.kind === "organizer";

  const browseEvents =
    query.kind === "empty" && (!!input.organizerId || !!input.category);
  const browsePlaces = query.kind === "empty" && input.placeCategoryId != null;
  const searchable = isSearchableQuery(query);

  const wantEvents =
    !organizerMode &&
    (input.mode === "all" || input.mode === "events") &&
    (searchable || browseEvents);
  const wantPlaces =
    options.program.placeSearch &&
    !organizerMode &&
    (input.mode === "all" || input.mode === "places") &&
    (searchable || browsePlaces);
  const wantOrganizers =
    options.program.organizerSearch &&
    searchable &&
    (input.mode === "organizers" ||
      (input.mode === "all" && !input.organizerId));

  const sizeFor = (group: keyof typeof SEARCH_ALL_SIZES) =>
    input.mode === "all"
      ? SEARCH_ALL_SIZES[group]
      : clampPageSize(input.pageSize, SEARCH_PAGE_SIZE);

  const asOf = cursor?.asOf ?? null;

  const eventsTask = wantEvents
    ? client.rpc("search_events", {
        p_query: query.normalized,
        p_lat: hasLocation ? lat : undefined,
        p_lng: hasLocation ? lng : undefined,
        p_radius_km: finite(input.radiusKm) ?? undefined,
        p_category: input.category ?? undefined,
        p_types: input.types?.length ? input.types : undefined,
        p_min_price: finite(input.minPrice) ?? undefined,
        p_max_price: finite(input.maxPrice) ?? undefined,
        p_start_date: input.startDate ?? undefined,
        p_end_date: input.endDate ?? undefined,
        p_min_rating: finite(input.minRating) ?? undefined,
        p_organizer_id: input.organizerId ?? undefined,
        p_as_of: asOf ?? undefined,
        p_cursor_score: cursor?.score,
        p_cursor_id: cursor?.id,
        p_page_size: sizeFor("events"),
      })
    : null;

  const placesTask = wantPlaces
    ? client.rpc("search_places", {
        p_query: query.normalized,
        p_lat: hasLocation ? lat : undefined,
        p_lng: hasLocation ? lng : undefined,
        p_radius_km: finite(input.radiusKm) ?? undefined,
        p_category_id: input.placeCategoryId ?? undefined,
        p_open_now: input.openNow ?? undefined,
        p_min_rating: finite(input.minRating) ?? undefined,
        p_as_of: asOf ?? undefined,
        p_cursor_score: cursor?.score,
        p_cursor_id: cursor?.id,
        p_page_size: sizeFor("places"),
      })
    : null;

  const organizersTask = wantOrganizers
    ? client.rpc("search_organizers", {
        p_query: query.normalized,
        p_lat: hasLocation ? lat : undefined,
        p_lng: hasLocation ? lng : undefined,
        p_as_of: asOf ?? undefined,
        p_cursor_score: cursor?.score,
        p_cursor_id: cursor?.id,
        p_page_size: sizeFor("organizers"),
      })
    : null;

  const [eventsRes, placesRes, organizersRes] = await Promise.all([
    eventsTask,
    placesTask,
    organizersTask,
  ]);

  const result: SearchResults = { ...base };

  if (eventsRes) {
    if (eventsRes.error) {
      logger.error(`search_events failed: ${eventsRes.error.message}`);
      result.events = { ...emptyGroup(), error: true };
    } else {
      const p = page(eventsRes.data as EventRow[], sizeFor("events"));
      result.events = {
        items: p.rows.map(toEventHit),
        hasNextPage: p.hasNextPage,
        nextCursor: p.next ? encodeCursor(p.next) : null,
      };
    }
  }
  if (placesRes) {
    if (placesRes.error) {
      logger.error(`search_places failed: ${placesRes.error.message}`);
      result.places = { ...emptyGroup(), error: true };
    } else {
      const p = page(placesRes.data as PlaceRow[], sizeFor("places"));
      result.places = {
        items: p.rows.map(toPlaceHit),
        hasNextPage: p.hasNextPage,
        nextCursor: p.next ? encodeCursor(p.next) : null,
      };
    }
  }
  if (organizersRes) {
    if (organizersRes.error) {
      logger.error(`search_organizers failed: ${organizersRes.error.message}`);
      result.organizers = { ...emptyGroup(), error: true };
    } else {
      const p = page(
        organizersRes.data as OrganizerRow[],
        sizeFor("organizers"),
      );
      result.organizers = {
        items: p.rows.map(toOrganizerHit),
        hasNextPage: p.hasNextPage,
        nextCursor: p.next ? encodeCursor(p.next) : null,
      };
    }
  }

  const ranAny = !!(eventsTask || placesTask || organizersTask);
  const allFailed =
    ranAny &&
    (!eventsRes || !!eventsRes.error) &&
    (!placesRes || !!placesRes.error) &&
    (!organizersRes || !!organizersRes.error);
  if (allFailed) {
    return {
      ...result,
      status: 500,
      message: "Search is unavailable right now.",
    };
  }

  // Only the first page of a search is a "search"; later pages are scrolling.
  if (options.log && options.loggingEnabled && ranAny && !cursor) {
    result.searchId = await logSearch({
      platform: options.platform,
      surface: input.mode,
      query,
      hasLocation,
      hasFilters:
        hasEventFilters(input) ||
        input.openNow === true ||
        input.placeCategoryId != null,
      counts: {
        events: result.events.items.length,
        places: result.places.items.length,
        organizers: result.organizers.items.length,
      },
      latencyMs: Date.now() - started,
    });
  }

  return result;
}

function toSuggestion(row: SuggestRow): SearchSuggestion {
  return {
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
  };
}

export async function suggestCore(
  client: SupabaseClient<Database>,
  input: { q: string; lat?: number | null; lng?: number | null },
  program: DiscoveryProgram,
): Promise<SearchSuggestionsResponse> {
  const query = parseSearchQuery(input.q);
  const empty: SearchSuggestionsResponse = {
    status: 200,
    query,
    events: [],
    places: [],
    organizers: [],
  };
  if (!program.searchV2) {
    return { ...empty, status: 403, message: "Search is not available." };
  }
  if (!isSearchableQuery(query)) return empty;

  const types = ["event"];
  if (program.placeSearch) types.push("place");
  if (program.organizerSearch) types.push("organizer");
  if (query.kind === "organizer" && !program.organizerSearch) return empty;

  const lat = finite(input.lat);
  const lng = finite(input.lng);
  const { data, error } = await client.rpc("search_suggest", {
    p_query: query.normalized,
    p_lat: lat !== null && lng !== null ? lat : undefined,
    p_lng: lat !== null && lng !== null ? lng : undefined,
    p_types: types,
  });
  if (error) {
    logger.error(`search_suggest failed: ${error.message}`);
    return {
      ...empty,
      status: 500,
      message: "Suggestions are unavailable right now.",
    };
  }
  const rows = ((data ?? []) as SuggestRow[]).map(toSuggestion);
  return {
    ...empty,
    events: rows.filter((r) => r.entityType === "event"),
    places: rows.filter((r) => r.entityType === "place"),
    organizers: rows.filter((r) => r.entityType === "organizer"),
  };
}

export async function logSearch(input: {
  platform: SearchPlatform;
  surface: SearchRequest["mode"] | "suggest";
  query: ParsedSearchQuery;
  hasLocation: boolean;
  hasFilters: boolean;
  counts: { events: number; places: number; organizers: number };
  latencyMs: number;
}): Promise<number | null> {
  try {
    const service = getSupabaseServiceClient();
    const { data, error } = await service.rpc("search_log_record", {
      p_platform: input.platform,
      p_surface: input.surface,
      p_query: input.query.normalized,
      p_has_location: input.hasLocation,
      p_has_filters: input.hasFilters,
      p_event_count: input.counts.events,
      p_place_count: input.counts.places,
      p_organizer_count: input.counts.organizers,
      p_latency_ms: input.latencyMs,
    });
    if (error) {
      logger.error(`search_log_record failed: ${error.message}`);
      return null;
    }
    return typeof data === "number" ? data : Number(data);
  } catch (e) {
    logger.error(`search logging failed: ${e}`);
    return null;
  }
}

export async function recordSearchClickCore(
  service: ServiceRoleClient,
  input: SearchClickInput,
): Promise<{ status: 200 | 400 | 500; message?: string }> {
  if (!Number.isSafeInteger(input.searchId) || input.searchId <= 0) {
    return { status: 400, message: "Invalid search." };
  }
  const { error } = await service.rpc("search_log_click", {
    p_id: input.searchId,
    p_type: input.entityType,
    p_entity_id: input.entityId,
    p_rank: Math.max(0, Math.trunc(input.rank)),
  });
  if (error) {
    logger.error(`search_log_click failed: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }
  return { status: 200 };
}
