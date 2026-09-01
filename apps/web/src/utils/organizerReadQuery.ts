import { logger } from "@abonten/core/logger";
import {
  type DashboardPeriod,
  getDashboardPeriodRange,
} from "@abonten/core/organizerDashboardDateRange";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type {
  OrganizerFinanceOverviewRow,
  OrganizerLedgerTransactionRow,
} from "@abonten/types/organizerFinance";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { UserPostType } from "@abonten/types/postsType";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth query bodies for an organizer's own read-only surfaces
// (dashboard overview, events list, finances). Shared by the Server Actions
// (cookie session) and the mobile HTTP routes (Bearer session) so the
// behaviour is identical on either transport — no logic fork.
//
// The three dashboard/finance RPCs are SECURITY INVOKER and scope
// themselves with `auth.uid()` internally; the ledger RPC is SECURITY
// DEFINER but filters `organizer_ledger_entry.organizer_id = auth.uid()`.
// `userId` is still threaded through for the direct `event` table read,
// whose RLS `event_organizer_select` also keys on `auth.uid()`.

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type OverviewRow = any;

export type OrganizerDashboardOverviewResult =
  | { status: 401 | 500; message: string }
  | {
      status: 200;
      data: { current: OverviewRow[]; previous: OverviewRow[] | null };
    };

export async function fetchOrganizerDashboardOverview(
  supabase: SupabaseClient,
  period: DashboardPeriod,
): Promise<OrganizerDashboardOverviewResult> {
  const { start, end, prevStart, prevEnd } = getDashboardPeriodRange(period);

  const [currentResult, previousResult] = await Promise.all([
    supabase.rpc("get_organizer_dashboard_overview", {
      p_start: start ? start.toISOString() : null,
      p_end: end ? end.toISOString() : null,
    }),
    prevStart && prevEnd
      ? supabase.rpc("get_organizer_dashboard_overview", {
          p_start: prevStart.toISOString(),
          p_end: prevEnd.toISOString(),
        })
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (currentResult.error) {
    logger.error("Supabase error:", currentResult.error.message);
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    data: {
      current: (currentResult.data ?? []) as OverviewRow[],
      previous: previousResult.error
        ? null
        : previousResult.data === null
          ? null
          : (previousResult.data as OverviewRow[]),
    },
  };
}

export type OrganizerFinanceOverviewResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: OrganizerFinanceOverviewRow[] };

export async function fetchOrganizerFinanceOverview(
  supabase: SupabaseClient,
): Promise<OrganizerFinanceOverviewResult> {
  const { data, error } = await supabase.rpc("get_organizer_finance_overview");

  if (error) {
    logger.error(
      `Failed fetching organizer finance overview: ${error.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as OrganizerFinanceOverviewRow[] };
}

export async function fetchOrganizerEventsPage(
  supabase: SupabaseClient,
  userId: string,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<UserPostType>> {
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("event")
    .select("*, occurrences:event_occurrence(*)")
    .eq("organizer_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data: events, error } = await query;

  if (error) {
    logger.error(`Error fetching organizer's events: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<UserPostType>(events ?? [], pageSize);

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type AttendanceRow = any;

// Cursor-paginated attendee list for one of the organizer's own events —
// same body as getAttendanceList. `event_organizer_select` RLS also keys on
// `auth.uid()`, but the explicit organizer_id filter keeps the 403 path
// (someone else's event id) identical to the web action.
export async function fetchEventAttendanceListPage(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<AttendanceRow>> {
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError || !event) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Not authorized to view this event",
    };
  }

  let query = supabase
    .from("attendance")
    .select(
      "*, user_info:user_id(username, full_name), ticket_type(type, price, currency), ticket:ticket_id(status, used_at)",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data: attendanceList, error: attendanceListError } = await query;

  if (attendanceListError) {
    logger.error("Supabase error:", attendanceListError.message);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<AttendanceRow>(
    attendanceList ?? [],
    pageSize,
  );

  // auth.users can't be PostgREST-embedded directly (no grants for
  // anon/authenticated, by design) -- fetch each attendee's real account
  // email/phone via the organizer-scoped RPC instead, and merge it back
  // onto each row so the UI's attendee.auth.email/.phone shape still works.
  const { data: contacts, error: contactsError } = await supabase.rpc(
    "get_event_attendee_contacts",
    { p_event_id: eventId },
  );

  if (contactsError) {
    logger.error(`Failed fetching attendee contacts: ${contactsError.message}`);
  }

  const contactsByUserId = new Map(
    (
      contacts as
        | { user_id: string; email: string | null; phone: string | null }[]
        | null
    )?.map((c) => [c.user_id, c]) ?? [],
  );

  const pageWithContacts = page.map((attendee: AttendanceRow) => ({
    ...attendee,
    auth: contactsByUserId.get(attendee.user_id) ?? null,
  }));

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: pageWithContacts, nextCursor, hasNextPage };
}

export async function fetchOrganizerLedgerPage(
  supabase: SupabaseClient,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<OrganizerLedgerTransactionRow>> {
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data: rows, error } = await supabase.rpc(
    "get_organizer_ledger_transactions",
    {
      p_cursor_created_at: cursor?.sortValue ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: pageSize + 1,
    },
  );

  if (error) {
    logger.error(`Failed fetching organizer transactions: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<OrganizerLedgerTransactionRow>(
    (rows ?? []) as OrganizerLedgerTransactionRow[],
    pageSize,
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: last.created_at,
          id: last.entry_id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

// biome-ignore lint/suspicious/noExplicitAny: joined place_category shape, no generated Supabase types (see PROJECT.md)
type OrganizerPlaceRow = any;

// Cursor-paginated list of the places owned by `ownerId` — the authed
// branch of getOrganizerPlaces (the public /user/:username/places branch
// stays in the action). RLS `place_owner_select` also keys on auth.uid();
// the explicit owner_id filter keeps the shape identical either way.
export async function fetchOrganizerPlacesPage(
  supabase: SupabaseClient,
  ownerId: string,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<OrganizerPlaceRow>> {
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("place")
    .select("*, place_category(name, slug)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data: places, error } = await query;

  if (error) {
    logger.error(`Error fetching organizer's places: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<OrganizerPlaceRow>(
    places ?? [],
    pageSize,
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}

export type PlaceInsightsCoreResult =
  | { status: 401 | 404 | 500; message: string }
  | { status: 200; data: Record<string, number> };

// Owner-only analytics for one place — the getPlaceInsights body: view /
// direction / phone / whatsapp event-type counts from
// place_analytics_event, plus favorites and approved-review counts. A
// select + JS reduce is fine (low-traffic owner dashboard, not a hot path).
export async function fetchPlaceInsights(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
): Promise<PlaceInsightsCoreResult> {
  const { data: place, error: fetchError } = await supabase
    .from("place")
    .select("id")
    .eq("id", placeId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (fetchError || !place) {
    return { status: 404, message: "Place not found or unauthorized" };
  }

  const [eventsResult, favoritesResult, reviewsResult] = await Promise.all([
    supabase
      .from("place_analytics_event")
      .select("event_type")
      .eq("place_id", placeId),
    supabase
      .from("favorite_place")
      .select("id", { count: "exact", head: true })
      .eq("place_id", placeId),
    supabase
      .from("place_review")
      .select("id", { count: "exact", head: true })
      .eq("place_id", placeId)
      .eq("status", "approved"),
  ]);

  if (eventsResult.error || favoritesResult.error || reviewsResult.error) {
    const message =
      eventsResult.error?.message ??
      favoritesResult.error?.message ??
      reviewsResult.error?.message;
    logger.error(`Error fetching place insights: ${message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const counts = (eventsResult.data ?? []).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.event_type] = (acc[row.event_type] ?? 0) + 1;
      return acc;
    },
    {},
  );

  counts.favorites = favoritesResult.count ?? 0;
  counts.reviews = reviewsResult.count ?? 0;

  return { status: 200, data: counts };
}
