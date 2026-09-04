import { logger } from "@abonten/core/logger";
import {
  type DashboardBucket,
  type DashboardPeriod,
  getDashboardPeriodRange,
} from "@abonten/core/organizerDashboardDateRange";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth query bodies for the organizer Dashboard's widget sections
// (Sales Over Time · Event Performance · Upcoming Events · Needs Attention ·
// Recent Activity). Shared by the five Server Actions (cookie session) and
// the mobile HTTP route (Bearer session) — same arrangement
// eventInsightsQuery.ts / organizerReadQuery.ts use for the other read
// surfaces, no logic fork.
//
// Each RPC (get_organizer_sales_timeline / _event_performance /
// _upcoming_events / _needs_attention / _recent_activity) scopes to the
// caller's own events via auth.uid(); a Bearer `authenticated` client
// resolves auth.uid() identically to the cookie session.

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

type Failed = { status: 500; message: string };

const FAILED: Failed = { status: 500, message: "Something went wrong!" };

export type SalesTimelineResult =
  | Failed
  | { status: 200; data: Row[]; bucket: DashboardBucket };

export type DashboardListResult = Failed | { status: 200; data: Row[] };

export async function fetchOrganizerSalesTimeline(
  supabase: SupabaseClient<Database>,
  period: DashboardPeriod,
): Promise<SalesTimelineResult> {
  const { start, end, bucket } = getDashboardPeriodRange(period);

  const { data, error } = await supabase.rpc("get_organizer_sales_timeline", {
    p_start: start ? start.toISOString() : null,
    p_end: end ? end.toISOString() : null,
    p_bucket: bucket,
    // Same generated-type gap as the other RPCs in this file: no DEFAULT
    // NULL declared even though the function accepts an open-ended range.
  } as unknown as Database["public"]["Functions"]["get_organizer_sales_timeline"]["Args"]);

  if (error) {
    logger.error(`get_organizer_sales_timeline: ${error.message}`);
    return FAILED;
  }

  return { status: 200, data: (data ?? []) as Row[], bucket };
}

export async function fetchOrganizerEventPerformance(
  supabase: SupabaseClient<Database>,
  period: DashboardPeriod,
  sort: "revenue" | "tickets" = "revenue",
  limit = 10,
): Promise<DashboardListResult> {
  const { start, end } = getDashboardPeriodRange(period);

  const { data, error } = await supabase.rpc(
    "get_organizer_event_performance",
    {
      p_start: start ? start.toISOString() : null,
      p_end: end ? end.toISOString() : null,
      p_sort: sort,
      p_limit: limit,
    } as unknown as Database["public"]["Functions"]["get_organizer_event_performance"]["Args"],
  );

  if (error) {
    logger.error(`get_organizer_event_performance: ${error.message}`);
    return FAILED;
  }

  return { status: 200, data: (data ?? []) as Row[] };
}

export async function fetchOrganizerUpcomingEvents(
  supabase: SupabaseClient<Database>,
  limit = 5,
): Promise<DashboardListResult> {
  const { data, error } = await supabase.rpc("get_organizer_upcoming_events", {
    p_limit: limit,
  });

  if (error) {
    logger.error(`get_organizer_upcoming_events: ${error.message}`);
    return FAILED;
  }

  return { status: 200, data: (data ?? []) as Row[] };
}

export async function fetchOrganizerNeedsAttention(
  supabase: SupabaseClient<Database>,
  daysSoon = 7,
): Promise<DashboardListResult> {
  const { data, error } = await supabase.rpc("get_organizer_needs_attention", {
    p_days_soon: daysSoon,
  });

  if (error) {
    logger.error(`get_organizer_needs_attention: ${error.message}`);
    return FAILED;
  }

  return { status: 200, data: (data ?? []) as Row[] };
}

export async function fetchOrganizerRecentActivity(
  supabase: SupabaseClient<Database>,
  limit = 8,
): Promise<DashboardListResult> {
  const { data, error } = await supabase.rpc("get_organizer_recent_activity", {
    p_limit: limit,
  });

  if (error) {
    logger.error(`get_organizer_recent_activity: ${error.message}`);
    return FAILED;
  }

  return { status: 200, data: (data ?? []) as Row[] };
}

export type OrganizerDashboardWidgets = {
  timeline: { rows: Row[]; bucket: DashboardBucket };
  performance: Row[];
  upcoming: Row[];
  attention: Row[];
  activity: Row[];
};

export type OrganizerDashboardWidgetsResult =
  | Failed
  | { status: 200; data: OrganizerDashboardWidgets };

/**
 * Every Dashboard widget section in one call — the mobile Dashboard reads
 * this instead of five round-trips, same aggregate arrangement
 * fetchEventInsights uses for the per-event Insights screen. `performance`
 * is fixed to the "revenue" sort / top 10 (the mobile screen has no sort
 * toggle); the web page keeps its own per-section actions for its
 * interactive sort.
 */
export async function fetchOrganizerDashboardWidgets(
  supabase: SupabaseClient<Database>,
  period: DashboardPeriod,
): Promise<OrganizerDashboardWidgetsResult> {
  const [timeline, performance, upcoming, attention, activity] =
    await Promise.all([
      fetchOrganizerSalesTimeline(supabase, period),
      fetchOrganizerEventPerformance(supabase, period, "revenue", 10),
      fetchOrganizerUpcomingEvents(supabase, 5),
      fetchOrganizerNeedsAttention(supabase, 7),
      fetchOrganizerRecentActivity(supabase, 8),
    ]);

  if (
    timeline.status !== 200 ||
    performance.status !== 200 ||
    upcoming.status !== 200 ||
    attention.status !== 200 ||
    activity.status !== 200
  ) {
    return FAILED;
  }

  return {
    status: 200,
    data: {
      timeline: { rows: timeline.data, bucket: timeline.bucket },
      performance: performance.data,
      upcoming: upcoming.data,
      attention: attention.data,
      activity: activity.data,
    },
  };
}
