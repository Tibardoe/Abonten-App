import type { ResolvedAdminRange } from "@abonten/core/admin/adminDateRange";
import { logger } from "@abonten/core/logger";
import type { AdminDashboardKpis } from "@abonten/types/adminMetrics";
import type { AdminContext, NeedsAttention } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { type AdminEnvelope, assertPermission } from "../adminContext";
import {
  toHealthRows,
  toRangeMetrics,
  toSnapshotMetrics,
} from "../shared/metricRows";

// The operations dashboard: one RPC, real aggregates, nothing estimated.
//
// Periods come from @abonten/core/admin/adminDateRange (calendar-aligned,
// half-open, with the equivalent previous window), so this module no longer
// resolves dates of its own and the console cannot drift from the organizer
// dashboard's definition of "last 30 days".
//
// Days are UTC days for every market: one definition of "today" across the
// console, whichever markets are open. (Ghana, the first market, is UTC+0,
// so its local days are the same.)

export type DashboardSnapshotV2 = AdminDashboardKpis & {
  range: ResolvedAdminRange;
  needsAttention: NeedsAttention;
};

export async function getDashboardCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  range: ResolvedAdminRange,
): Promise<AdminEnvelope<DashboardSnapshotV2>> {
  try {
    assertPermission(ctx, "dashboard.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data, error } = await supabase.rpc("admin_dashboard_kpis", {
    p_from: range.from,
    p_to: range.to,
    p_prev_from: range.prevFrom ?? range.from,
    p_prev_to: range.prevTo ?? range.from,
  });

  if (error) {
    logger.error(`getDashboardCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load the dashboard figures." };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const counts = (payload.needsAttention ?? {}) as Record<string, number>;

  return {
    status: 200,
    data: {
      range,
      snapshot: toSnapshotMetrics(payload.snapshot),
      current: toRangeMetrics(payload.current),
      previous: toRangeMetrics(payload.previous),
      health: toHealthRows(payload.health),
      needsAttention: {
        openReports: counts.openReports ?? 0,
        urgentReports: counts.urgentReports ?? 0,
        reportsUnassigned: counts.reportsUnassigned ?? 0,
        pendingClaims: counts.pendingClaims ?? 0,
        pendingVerifications: counts.pendingVerifications ?? 0,
        openErrorGroups: counts.openErrorGroups ?? 0,
        failingHealthChecks: counts.failingHealthChecks ?? 0,
        stuckPayments: counts.stuckPayments ?? 0,
        pendingRefunds: counts.pendingRefunds ?? 0,
        pendingPayouts: counts.pendingPayouts ?? 0,
      },
    },
  };
}
