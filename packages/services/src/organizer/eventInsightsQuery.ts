import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth query bodies for a single event's Insights surface (the
// Details/Promotion/Insights management page's Insights tab). Shared by the
// six Server Actions (cookie session) and the mobile HTTP route (Bearer
// session) so the behaviour is identical on either transport — the same
// arrangement organizerReadQuery.ts already uses for the dashboard/finance
// read surfaces, no logic fork.
//
// The five `get_event_*_analytics` / `_stats` RPCs are SECURITY INVOKER and
// each re-check `event.organizer_id = auth.uid()` internally (migration
// 20260903100000); `get_event_refund_breakdown` / `is_event_settled` are
// SECURITY DEFINER but scoped to the caller's own ledger rows / granted to
// `authenticated` (migration 20260819110000). A Bearer `authenticated`
// client resolves `auth.uid()` the same way the cookie session does, so
// every call here works identically on mobile. `userId` is still threaded
// through for the direct `event` ownership pre-check, whose RLS
// `event_organizer_select` also keys on `auth.uid()`.

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

type DateBound = string | null | undefined;

export type EventFinanceSummary = {
  currency: string;
  ticketSales: number;
  platformFee: number;
  refunds: number;
  netSales: number;
  pendingRefunds: number;
  completedRefunds: number;
  refundRequestCount: number;
  organizerEarnings: number;
  settled: boolean;
};

type Unauthorized = { status: 403; message: string };
type Failed = { status: 500; message: string };

export type EventOverviewAnalyticsResult =
  | Unauthorized
  | Failed
  | { status: 200; data: Row | null };

export type EventFinanceSummaryResult =
  | Unauthorized
  | Failed
  | { status: 200; data: EventFinanceSummary | null };

export type EventListAnalyticsResult =
  | Unauthorized
  | Failed
  | { status: 200; data: Row[] };

export type EventDateAnalyticsResult =
  | Unauthorized
  | Failed
  | { status: 200; data: Row[]; hasOccurrences: boolean };

export type EventReturningAttendeeResult =
  | Unauthorized
  | Failed
  | { status: 200; data: Row };

export type EventInsightsResult =
  | Unauthorized
  | Failed
  | {
      status: 200;
      data: {
        overview: Row | null;
        finance: EventFinanceSummary | null;
        ticketTypes: Row[];
        promos: Row[];
        dates: { rows: Row[]; hasOccurrences: boolean };
        returning: Row;
      };
    };

const NOT_AUTHORIZED: Unauthorized = {
  status: 403,
  message: "Not authorized to view this event",
};
const FAILED: Failed = { status: 500, message: "Something went wrong!" };

async function ownsEvent(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();
  return !error && !!data;
}

// --- internal RPC bodies (ownership already verified by the caller) ---

async function runOverview(
  supabase: SupabaseClient<Database>,
  eventId: string,
  startDate: DateBound,
  endDate: DateBound,
): Promise<EventOverviewAnalyticsResult> {
  const { data, error } = await supabase.rpc("get_event_overview_analytics", {
    p_event_id: eventId,
    p_start_date: startDate ?? undefined,
    p_end_date: endDate ?? undefined,
  });
  if (error) {
    logger.error("Supabase error:", error.message);
    return FAILED;
  }
  const rows = (data ?? []) as Row[];
  return { status: 200, data: rows[0] ?? null };
}

async function runTicketTypes(
  supabase: SupabaseClient<Database>,
  eventId: string,
  startDate: DateBound,
  endDate: DateBound,
): Promise<EventListAnalyticsResult> {
  const { data, error } = await supabase.rpc(
    "get_event_ticket_type_analytics",
    {
      p_event_id: eventId,
      p_start_date: startDate ?? undefined,
      p_end_date: endDate ?? undefined,
    },
  );
  if (error) {
    logger.error("Supabase error:", error.message);
    return FAILED;
  }
  return { status: 200, data: (data ?? []) as Row[] };
}

async function runPromos(
  supabase: SupabaseClient<Database>,
  eventId: string,
  startDate: DateBound,
  endDate: DateBound,
): Promise<EventListAnalyticsResult> {
  const { data, error } = await supabase.rpc("get_event_promo_analytics", {
    p_event_id: eventId,
    p_start_date: startDate ?? undefined,
    p_end_date: endDate ?? undefined,
  });
  if (error) {
    logger.error("Supabase error:", error.message);
    return FAILED;
  }
  return { status: 200, data: (data ?? []) as Row[] };
}

async function runDates(
  supabase: SupabaseClient<Database>,
  eventId: string,
  startDate: DateBound,
  endDate: DateBound,
): Promise<EventDateAnalyticsResult> {
  // Single-date/range events never populate event_occurrence at all (see
  // postEventCore.ts), which is the common case — skip the RPC round trip
  // entirely rather than calling it just to get an empty result back.
  const { count, error: countError } = await supabase
    .from("event_occurrence")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (countError) {
    logger.error("Supabase error:", countError.message);
    return FAILED;
  }
  if (!count) {
    return { status: 200, data: [], hasOccurrences: false };
  }
  const { data, error } = await supabase.rpc("get_event_date_analytics", {
    p_event_id: eventId,
    p_start_date: startDate ?? undefined,
    p_end_date: endDate ?? undefined,
  });
  if (error) {
    logger.error("Supabase error:", error.message);
    return FAILED;
  }
  return { status: 200, data: (data ?? []) as Row[], hasOccurrences: true };
}

async function runReturning(
  supabase: SupabaseClient<Database>,
  eventId: string,
  startDate: DateBound,
  endDate: DateBound,
): Promise<EventReturningAttendeeResult> {
  const { data, error } = await supabase.rpc(
    "get_event_returning_attendee_stats",
    {
      p_event_id: eventId,
      p_start_date: startDate ?? undefined,
      p_end_date: endDate ?? undefined,
    },
  );
  if (error) {
    logger.error("Supabase error:", error.message);
    return FAILED;
  }
  const rows = (data ?? []) as Row[];
  return {
    status: 200,
    data: rows[0] ?? { returning_count: 0, first_time_count: 0 },
  };
}

async function runFinance(
  supabase: SupabaseClient<Database>,
  eventId: string,
  startDate: DateBound,
  endDate: DateBound,
): Promise<EventFinanceSummaryResult> {
  // pendingRefunds/completedRefunds/settled below come from get_event_refund_
  // breakdown/is_event_settled, which are lifetime/current-state facts (an
  // event either is or isn't settled) — not date-scoped by design, even
  // when a period is passed here for the ticketSales/refunds/netSales figures.
  let ledgerQuery = supabase
    .from("organizer_ledger_entry")
    .select("entry_type, amount, gross_amount, fee_amount, currency")
    .eq("event_id", eventId)
    .in("entry_type", [
      "earning",
      "refund_adjustment",
      "refund_hold",
      "refund_release",
    ]);

  if (startDate) ledgerQuery = ledgerQuery.gte("created_at", startDate);
  if (endDate) ledgerQuery = ledgerQuery.lte("created_at", endDate);

  const { data: ledgerRows, error: ledgerError } = await ledgerQuery;

  if (ledgerError) {
    logger.error(`Failed fetching event ledger rows: ${ledgerError.message}`);
    return FAILED;
  }

  const rows = (ledgerRows ?? []) as {
    entry_type:
      | "earning"
      | "refund_adjustment"
      | "refund_hold"
      | "refund_release";
    amount: number;
    gross_amount: number | null;
    fee_amount: number | null;
    currency: string;
  }[];

  if (rows.length === 0) {
    return { status: 200, data: null };
  }

  const currency = rows[0].currency;
  const summary = rows.reduce(
    (acc, row) => {
      if (row.entry_type === "earning") {
        acc.ticketSales += row.gross_amount ?? 0;
        acc.platformFee += row.fee_amount ?? 0;
      } else {
        acc.refunds += row.amount;
      }
      acc.organizerEarnings += row.amount;
      return acc;
    },
    { ticketSales: 0, platformFee: 0, refunds: 0, organizerEarnings: 0 },
  );

  // A ledger row alone can't say whether a refund is still pending or
  // already confirmed — that lives on transaction.status, which the
  // organizer's own session can't read directly. get_event_refund_breakdown
  // is a SECURITY DEFINER RPC scoped to this organizer's own ledger rows
  // that safely bridges that gap.
  const { data: refundBreakdownRows, error: refundBreakdownError } =
    await supabase.rpc("get_event_refund_breakdown", { p_event_id: eventId });

  if (refundBreakdownError) {
    logger.error(
      `Failed fetching event refund breakdown: ${refundBreakdownError.message}`,
    );
  }

  const breakdown = (
    (refundBreakdownRows ?? []) as {
      currency: string;
      refund_request_count: number;
      pending_refund_amount: number;
      completed_refund_amount: number;
    }[]
  ).find((row) => row.currency === currency);

  const { data: settled } = await supabase.rpc("is_event_settled", {
    p_event_id: eventId,
  });

  return {
    status: 200,
    data: {
      currency,
      ...summary,
      netSales: summary.ticketSales + summary.refunds,
      pendingRefunds: breakdown?.pending_refund_amount ?? 0,
      completedRefunds: breakdown?.completed_refund_amount ?? 0,
      refundRequestCount: breakdown?.refund_request_count ?? 0,
      settled: Boolean(settled),
    },
  };
}

// --- public per-section fetchers (used by the Server Actions) ---

export async function fetchEventOverviewAnalytics(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  startDate?: DateBound,
  endDate?: DateBound,
): Promise<EventOverviewAnalyticsResult> {
  if (!(await ownsEvent(supabase, userId, eventId))) return NOT_AUTHORIZED;
  return runOverview(supabase, eventId, startDate, endDate);
}

export async function fetchEventFinanceSummary(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  startDate?: DateBound,
  endDate?: DateBound,
): Promise<EventFinanceSummaryResult> {
  if (!(await ownsEvent(supabase, userId, eventId))) return NOT_AUTHORIZED;
  return runFinance(supabase, eventId, startDate, endDate);
}

export async function fetchEventTicketTypeAnalytics(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  startDate?: DateBound,
  endDate?: DateBound,
): Promise<EventListAnalyticsResult> {
  if (!(await ownsEvent(supabase, userId, eventId))) return NOT_AUTHORIZED;
  return runTicketTypes(supabase, eventId, startDate, endDate);
}

export async function fetchEventPromoAnalytics(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  startDate?: DateBound,
  endDate?: DateBound,
): Promise<EventListAnalyticsResult> {
  if (!(await ownsEvent(supabase, userId, eventId))) return NOT_AUTHORIZED;
  return runPromos(supabase, eventId, startDate, endDate);
}

export async function fetchEventDateAnalytics(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  startDate?: DateBound,
  endDate?: DateBound,
): Promise<EventDateAnalyticsResult> {
  if (!(await ownsEvent(supabase, userId, eventId))) return NOT_AUTHORIZED;
  return runDates(supabase, eventId, startDate, endDate);
}

export async function fetchEventReturningAttendeeStats(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  startDate?: DateBound,
  endDate?: DateBound,
): Promise<EventReturningAttendeeResult> {
  if (!(await ownsEvent(supabase, userId, eventId))) return NOT_AUTHORIZED;
  return runReturning(supabase, eventId, startDate, endDate);
}

// --- aggregate (used by the mobile route) ---

// The mobile Insights screen renders every section at once, so it takes one
// aggregate call rather than the six lazy per-section queries the web page
// makes. Ownership is checked once, then all six bodies run in parallel.
export async function fetchEventInsights(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  startDate?: DateBound,
  endDate?: DateBound,
): Promise<EventInsightsResult> {
  if (!(await ownsEvent(supabase, userId, eventId))) return NOT_AUTHORIZED;

  const [overview, finance, ticketTypes, promos, dates, returning] =
    await Promise.all([
      runOverview(supabase, eventId, startDate, endDate),
      runFinance(supabase, eventId, startDate, endDate),
      runTicketTypes(supabase, eventId, startDate, endDate),
      runPromos(supabase, eventId, startDate, endDate),
      runDates(supabase, eventId, startDate, endDate),
      runReturning(supabase, eventId, startDate, endDate),
    ]);

  const firstFailure = [
    overview,
    finance,
    ticketTypes,
    promos,
    dates,
    returning,
  ].find((r) => r.status === 500);
  if (firstFailure) return FAILED;

  return {
    status: 200,
    data: {
      overview: overview.status === 200 ? overview.data : null,
      finance: finance.status === 200 ? finance.data : null,
      ticketTypes: ticketTypes.status === 200 ? ticketTypes.data : [],
      promos: promos.status === 200 ? promos.data : [],
      dates:
        dates.status === 200
          ? { rows: dates.data, hasOccurrences: dates.hasOccurrences }
          : { rows: [], hasOccurrences: false },
      returning:
        returning.status === 200
          ? returning.data
          : { returning_count: 0, first_time_count: 0 },
    },
  };
}
