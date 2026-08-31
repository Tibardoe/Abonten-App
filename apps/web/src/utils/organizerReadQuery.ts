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
