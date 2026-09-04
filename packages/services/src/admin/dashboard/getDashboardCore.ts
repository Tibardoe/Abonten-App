import { logger } from "@abonten/core/logger";
import type {
  AdminContext,
  DashboardRange,
  DashboardSnapshot,
  HealthCheckSnapshot,
  NeedsAttention,
} from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AdminEnvelope, assertPermission } from "../adminContext";

// The operations dashboard payload — real aggregates only (spec §32/§50).
//
// Timezone: Abonten operates in Ghana, which is Africa/Accra = UTC+0 all
// year (no DST). So UTC day boundaries ARE local day boundaries — no tz
// library needed. If the platform ever spans regions this becomes a real
// tz calculation; flagged in PROJECT.md.
export const PLATFORM_TZ = "Africa/Accra"; // UTC+0, no DST

function resolveRange(
  range: DashboardRange,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string } {
  const now = new Date();
  const startOfUtcDay = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  if (range === "custom" && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }
  const to = now.toISOString();
  switch (range) {
    case "today":
      return { from: startOfUtcDay(now).toISOString(), to };
    case "yesterday": {
      const y = startOfUtcDay(new Date(now.getTime() - 86_400_000));
      return { from: y.toISOString(), to: startOfUtcDay(now).toISOString() };
    }
    case "7d":
      return {
        from: new Date(now.getTime() - 7 * 86_400_000).toISOString(),
        to,
      };
    case "30d":
      return {
        from: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
        to,
      };
    case "90d":
      return {
        from: new Date(now.getTime() - 90 * 86_400_000).toISOString(),
        to,
      };
    default:
      return {
        from: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
        to,
      };
  }
}

// biome-ignore lint/suspicious/noExplicitAny: PostgREST filter-builder chaining is not worth typing here
type CountQuery = any;

async function count(
  supabase: SupabaseClient<Database>,
  table: string,
  build?: (q: CountQuery) => CountQuery,
): Promise<number> {
  // Cast the client itself (not just the table name) to sidestep resolving
  // "*" against the full ~120-table union, which blows up TS's type
  // instantiation depth for a helper that's explicitly meant to be
  // table-agnostic (see the CountQuery = any above).
  // biome-ignore lint/suspicious/noExplicitAny: see CountQuery above
  let q: CountQuery = (supabase as any)
    .from(table)
    .select("*", { count: "exact", head: true });
  if (build) q = build(q);
  const { count: c, error } = await q;
  if (error) {
    logger.error(`dashboard count(${table}) failed: ${error.message}`);
    return 0;
  }
  return c ?? 0;
}

export async function getDashboardCore(
  supabase: SupabaseClient<Database>,
  ctx: AdminContext,
  input: { range: DashboardRange; from?: string; to?: string } = {
    range: "30d",
  },
): Promise<AdminEnvelope<DashboardSnapshot>> {
  try {
    assertPermission(ctx, "dashboard.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { from, to } = resolveRange(input.range, input.from, input.to);

  const [
    totalUsers,
    newUsers,
    events,
    places,
    ticketsSold,
    { data: feeRows },
    { data: refundTxns },
    { data: organizerRows },
    { data: healthRows },
    { data: counts },
  ] = await Promise.all([
    count(supabase, "user_info"),
    count(supabase, "user_info", (q) =>
      q.gte("created_at", from).lte("created_at", to),
    ),
    count(supabase, "event"),
    count(supabase, "place"),
    count(supabase, "ticket", (q) =>
      q.gte("issued_at", from).lte("issued_at", to),
    ),
    supabase
      .from("platform_fee_entry")
      .select("service_fee, ticket_revenue, currency, created_at")
      .gte("created_at", from)
      .lte("created_at", to),
    supabase
      .from("transaction")
      .select("amount, currency")
      .in("status", ["refunded", "refund_pending"])
      .gte("updated_at", from)
      .lte("updated_at", to),
    supabase.from("event").select("organizer_id"),
    supabase
      .from("health_check_result")
      .select("check_key, ok, latency_ms, detail, checked_at")
      .order("checked_at", { ascending: false })
      .limit(200),
    supabase.rpc("admin_dashboard_counts"),
  ]);

  let grossTicketSales = 0;
  let platformFeeRevenue = 0;
  let currency = "GHS";
  for (const row of feeRows ?? []) {
    grossTicketSales += Number(row.ticket_revenue ?? 0);
    platformFeeRevenue += Number(row.service_fee ?? 0);
    if (row.currency) currency = row.currency;
  }
  let refunds = 0;
  for (const row of refundTxns ?? []) refunds += Number(row.amount ?? 0);

  const organizers = new Set((organizerRows ?? []).map((r) => r.organizer_id))
    .size;

  // latest health per check
  const seen = new Set<string>();
  const health: HealthCheckSnapshot[] = [];
  for (const row of healthRows ?? []) {
    if (seen.has(row.check_key)) continue;
    seen.add(row.check_key);
    health.push({
      key: row.check_key,
      ok: row.ok,
      latencyMs: row.latency_ms,
      detail: row.detail,
      checkedAt: row.checked_at,
    } as unknown as HealthCheckSnapshot);
  }

  const c = (counts ?? {}) as Record<string, number>;
  const needsAttention: NeedsAttention = {
    openReports: c.openReports ?? 0,
    urgentReports: c.urgentReports ?? 0,
    reportsUnassigned: c.reportsUnassigned ?? 0,
    pendingClaims: c.pendingClaims ?? 0,
    openErrorGroups: c.openErrorGroups ?? 0,
    failingHealthChecks: c.failingHealthChecks ?? 0,
    stuckPayments: c.stuckPayments ?? 0,
    pendingRefunds: c.pendingRefunds ?? 0,
    pendingPayouts: c.pendingPayouts ?? 0,
  };

  return {
    status: 200,
    data: {
      range: input.range,
      from,
      to,
      kpis: {
        totalUsers,
        newUsers,
        organizers,
        events,
        places,
        ticketsSold,
        grossTicketSales,
        platformFeeRevenue,
        refunds,
        currency,
      },
      health,
      needsAttention,
    },
  };
}
