import type { ResolvedAdminRange } from "@abonten/core/admin/adminDateRange";
import {
  type SuppressedBucket,
  applySmallSampleRule,
  ratioState,
} from "@abonten/core/admin/smallSample";
import { logger } from "@abonten/core/logger";
import type {
  AdminRangeMetrics,
  AdminSnapshotMetrics,
} from "@abonten/types/adminMetrics";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { type AdminEnvelope, assertPermission } from "../adminContext";
import { num, toRangeMetrics, toSnapshotMetrics } from "../shared/metricRows";

// Platform Analytics: growth, sales and the only breakdowns of people the
// data honestly supports.
//
// Three RPCs, aggregated in Postgres. The page used to pull up to 50,000 raw
// rows per metric and bucket them in JavaScript, which silently dropped every
// period that had no activity — a gap in a chart that read as "no data" when
// it meant "zero".
//
// Demographics are aggregate-only and pass through the small-sample rule
// before they leave this module, so nothing that could point at one person
// ever reaches a screen.

export type AnalyticsSeriesRow = {
  bucketStart: string;
  newUsers: number;
  newEvents: number;
  newPlaces: number;
  paidTickets: number;
  freeRegistrations: number;
  grossTicketSales: number;
  serviceFeeRevenue: number;
  cashRefunded: number;
};

export type AnalyticsPreviousRow = {
  bucketStart: string;
  newUsers: number;
  paidTickets: number;
  grossTicketSales: number;
};

export type AnalyticsTopEventRow = {
  id: string;
  title: string;
  organizerId: string | null;
  organizerName: string | null;
  paidTickets: number;
  grossTicketSales: number;
};

export type AnalyticsTopOrganizerRow = {
  id: string;
  name: string | null;
  grossTicketSales: number;
  currency: string;
};

export type DemographicBreakdown = {
  buckets: SuppressedBucket[];
  total: number;
  suppressedCount: number;
  allSuppressed: boolean;
};

export type AnalyticsDemographics = {
  signInMethod: DemographicBreakdown;
  platform: DemographicBreakdown;
  /** People with a push-enabled device — the platform mix's real population. */
  platformUsersTotal: number;
  accountStatus: DemographicBreakdown;
  roles: DemographicBreakdown;
  activeUsers: number;
  buyersAllTime: number;
  repeatBuyersAllTime: number;
  buyersCurrent: number;
  buyersPrevious: number;
  returningBuyers: number;
  /** null when the sample is too small to state a percentage honestly. */
  buyerConversion: number | null;
  repeatBuyerShare: number | null;
  returningBuyerRate: number | null;
};

export type PlatformAnalyticsV2 = {
  range: ResolvedAdminRange;
  bucket: "hour" | "day" | "week";
  snapshot: AdminSnapshotMetrics;
  current: AdminRangeMetrics;
  previous: AdminRangeMetrics;
  series: AnalyticsSeriesRow[];
  previousSeries: AnalyticsPreviousRow[];
  topEvents: AnalyticsTopEventRow[];
  topOrganizers: AnalyticsTopOrganizerRow[];
  /** Sales that cover several events at once and cannot be attributed. */
  grossWithoutEvent: number;
  demographics: AnalyticsDemographics;
};

type Row = Record<string, unknown>;

/**
 * `suppress` is on for anything that describes a person — how they sign in,
 * what device they carry. It is off for operational states the console
 * already shows elsewhere as plain counts (account status on the Users page,
 * organizers on the Organizers page): hiding those buys no privacy and costs
 * an operator real information.
 */
function toBreakdown(raw: unknown, suppress = true): DemographicBreakdown {
  const list = Array.isArray(raw) ? raw : [];
  const buckets = list.map((b) => {
    const r = (b ?? {}) as Row;
    return { key: String(r.key ?? "unknown"), count: num(r.count) };
  });
  if (!suppress) {
    return {
      buckets: buckets.map((b) => ({ ...b, suppressed: false })),
      total: buckets.reduce((sum, b) => sum + b.count, 0),
      suppressedCount: 0,
      allSuppressed: false,
    };
  }
  const result = applySmallSampleRule(buckets);
  return {
    buckets: result.buckets,
    total: result.total,
    suppressedCount: result.suppressedCount,
    allSuppressed: result.allSuppressed,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return ratioState(numerator, denominator) === "ok"
    ? numerator / denominator
    : null;
}

export async function getPlatformAnalyticsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  range: ResolvedAdminRange,
): Promise<AdminEnvelope<PlatformAnalyticsV2>> {
  try {
    assertPermission(ctx, "analytics.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const prevFrom = range.prevFrom ?? range.from;
  const prevTo = range.prevTo ?? range.from;

  const [kpis, analytics, demographics] = await Promise.all([
    supabase.rpc("admin_dashboard_kpis", {
      p_from: range.from,
      p_to: range.to,
      p_prev_from: prevFrom,
      p_prev_to: prevTo,
    }),
    supabase.rpc("admin_platform_analytics", {
      p_from: range.from,
      p_to: range.to,
      p_bucket: range.bucket,
      p_prev_from: prevFrom,
      p_prev_to: prevTo,
    }),
    supabase.rpc("admin_user_demographics", {
      p_from: range.from,
      p_to: range.to,
      p_prev_from: prevFrom,
      p_prev_to: prevTo,
    }),
  ]);

  const failure = kpis.error ?? analytics.error ?? demographics.error;
  if (failure) {
    logger.error(`getPlatformAnalyticsCore failed: ${failure.message}`);
    return { status: 500, message: "Couldn't load the analytics figures." };
  }

  const k = (kpis.data ?? {}) as Row;
  const a = (analytics.data ?? {}) as Row;
  const d = (demographics.data ?? {}) as Row;

  const series = (Array.isArray(a.series) ? a.series : []).map((row) => {
    const r = (row ?? {}) as Row;
    return {
      bucketStart: String(r.bucketStart ?? ""),
      newUsers: num(r.newUsers),
      newEvents: num(r.newEvents),
      newPlaces: num(r.newPlaces),
      paidTickets: num(r.paidTickets),
      freeRegistrations: num(r.freeRegistrations),
      grossTicketSales: num(r.grossTicketSales),
      serviceFeeRevenue: num(r.serviceFeeRevenue),
      cashRefunded: num(r.cashRefunded),
    } satisfies AnalyticsSeriesRow;
  });

  const previousSeries = (
    Array.isArray(a.previousSeries) ? a.previousSeries : []
  ).map((row) => {
    const r = (row ?? {}) as Row;
    return {
      bucketStart: String(r.bucketStart ?? ""),
      newUsers: num(r.newUsers),
      paidTickets: num(r.paidTickets),
      grossTicketSales: num(r.grossTicketSales),
    } satisfies AnalyticsPreviousRow;
  });

  const topEvents = (Array.isArray(a.topEvents) ? a.topEvents : []).map(
    (row) => {
      const r = (row ?? {}) as Row;
      return {
        id: String(r.id ?? ""),
        title: String(r.title ?? ""),
        organizerId: r.organizerId ? String(r.organizerId) : null,
        organizerName: r.organizerName ? String(r.organizerName) : null,
        paidTickets: num(r.paidTickets),
        grossTicketSales: num(r.grossTicketSales),
      } satisfies AnalyticsTopEventRow;
    },
  );

  const topOrganizers = (
    Array.isArray(a.topOrganizers) ? a.topOrganizers : []
  ).map((row) => {
    const r = (row ?? {}) as Row;
    return {
      id: String(r.id ?? ""),
      name: r.name ? String(r.name) : null,
      grossTicketSales: num(r.grossTicketSales),
      currency: typeof r.currency === "string" ? r.currency : "",
    } satisfies AnalyticsTopOrganizerRow;
  });

  const activeUsers = num(d.activeUsers);
  const buyersAllTime = num(d.buyersAllTime);
  const buyersPrevious = num(d.buyersPrevious);

  return {
    status: 200,
    data: {
      range,
      bucket: range.bucket,
      snapshot: toSnapshotMetrics(k.snapshot),
      current: toRangeMetrics(k.current),
      previous: toRangeMetrics(k.previous),
      series,
      previousSeries,
      topEvents,
      topOrganizers,
      grossWithoutEvent: num(a.grossWithoutEvent),
      demographics: {
        signInMethod: toBreakdown(d.signInMethod),
        platform: toBreakdown(d.platform),
        platformUsersTotal: num(d.platformUsersTotal),
        accountStatus: toBreakdown(d.accountStatus, false),
        roles: toBreakdown(d.roles, false),
        activeUsers,
        buyersAllTime,
        repeatBuyersAllTime: num(d.repeatBuyersAllTime),
        buyersCurrent: num(d.buyersCurrent),
        buyersPrevious,
        returningBuyers: num(d.returningBuyers),
        buyerConversion: ratio(buyersAllTime, activeUsers),
        repeatBuyerShare: ratio(num(d.repeatBuyersAllTime), buyersAllTime),
        returningBuyerRate: ratio(num(d.returningBuyers), buyersPrevious),
      },
    },
  };
}
