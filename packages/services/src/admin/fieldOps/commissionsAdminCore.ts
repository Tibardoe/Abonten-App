import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsCommission,
  FieldOpsCommissionDetail,
  FieldOpsCommissionStatus,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  COMMISSION_COLUMNS,
  type CommissionRow,
  loadCommissionTimeline,
  mapCommission,
} from "../../fieldOps/shared/commissionRows";
import { notifyFieldOps } from "../../fieldOps/shared/fieldOpsRows";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import { type RequestMeta, dbError, denied } from "./fieldOpsAdminShared";

// Admin > Field Ops > Commissions: the ledger view and the one destructive
// action on it — a reversal, which never edits the original row. Amounts
// come from the ledger; an admin can only change a status, and only through
// fieldops_reverse_commission.

export type ListCommissionFilters = {
  campaignId?: string;
  memberId?: string;
  status?: FieldOpsCommissionStatus;
  cursor?: string;
};

export async function listCommissionsAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListCommissionFilters,
): Promise<
  AdminEnvelope<{
    items: (FieldOpsCommission & { campaignName: string })[];
    nextCursor: string | null;
    totals: Record<FieldOpsCommissionStatus, number>;
  }>
> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const PAGE = 50;
  let q = supabase
    .from("fieldops_commission")
    .select(`${COMMISSION_COLUMNS}, fieldops_campaign(name)`)
    .order("earned_at", { ascending: false })
    .limit(PAGE + 1);
  if (filters.campaignId) q = q.eq("campaign_id", filters.campaignId);
  if (filters.memberId) q = q.eq("member_id", filters.memberId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.cursor) q = q.lt("earned_at", filters.cursor);

  const [{ data, error }, { data: allRows }] = await Promise.all([
    q,
    // Small volumes (a team of 12 per campaign), so the status totals are
    // summed live rather than kept in a rollup table.
    supabase
      .from("fieldops_commission")
      .select("status, amount_minor, campaign_id")
      .limit(5000),
  ]);
  if (error) return dbError(error, "Could not load commissions");

  const rows = (data ?? []) as unknown as (CommissionRow & {
    fieldops_campaign: { name: string } | null;
  })[];
  const page = rows.slice(0, PAGE);

  const totals: Record<FieldOpsCommissionStatus, number> = {
    pending: 0,
    approved: 0,
    in_payout: 0,
    paid: 0,
    rejected: 0,
    reversed: 0,
  };
  for (const r of allRows ?? []) {
    if (filters.campaignId && r.campaign_id !== filters.campaignId) continue;
    const key = r.status as FieldOpsCommissionStatus;
    if (key in totals) totals[key] += Number(r.amount_minor ?? 0);
  }

  return {
    status: 200,
    data: {
      items: page.map((r) => ({
        ...mapCommission(r),
        campaignName: r.fieldops_campaign?.name ?? "",
      })),
      nextCursor:
        rows.length > PAGE ? (page[page.length - 1]?.earned_at ?? null) : null,
      totals,
    },
  };
}

export async function getCommissionAdminDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  commissionId: string,
): Promise<AdminEnvelope<FieldOpsCommissionDetail>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const { data } = await supabase
    .from("fieldops_commission")
    .select(COMMISSION_COLUMNS)
    .eq("id", commissionId)
    .maybeSingle();
  const row = data as unknown as CommissionRow | null;
  if (!row) return { status: 404, message: "Commission not found" };
  return {
    status: 200,
    data: {
      commission: mapCommission(row),
      timeline: await loadCommissionTimeline(supabase, row.id),
    },
  };
}

/**
 * Takes a commission back. A paid one keeps its row and gains a negative
 * offset beside it, so the money that actually left is still visible and
 * the payout reconciliation balances; one that was only approved simply
 * becomes `reversed`.
 */
export async function reverseCommissionAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { commissionId: string; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<FieldOpsCommission>> {
  try {
    assertPermission(ctx, "fieldops.commissions.approve");
  } catch (e) {
    return denied(e);
  }
  const { data } = await supabase
    .from("fieldops_commission")
    .select(COMMISSION_COLUMNS)
    .eq("id", input.commissionId)
    .maybeSingle();
  const before = data as unknown as CommissionRow | null;
  if (!before) return { status: 404, message: "Commission not found" };

  const { error } = await supabase.rpc("fieldops_reverse_commission", {
    p_commission_id: input.commissionId,
    p_admin: ctx.userId,
    p_reason: input.reason,
  });
  if (error) return dbError(error, "Could not reverse the commission");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.commission.reverse",
    targetType: "fieldops_commission",
    targetId: input.commissionId,
    summary: `Reversed ${before.currency} ${(Number(before.amount_minor) / 100).toFixed(2)} for ${before.fieldops_team_member?.full_name_snapshot ?? before.member_user_id}`,
    reason: input.reason,
    before: { status: before.status, amountMinor: Number(before.amount_minor) },
    after: { status: "reversed" },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  await notifyFieldOps(supabase, [before.member_user_id], {
    type: "fieldops_commission_reversed",
    title: "A commission was taken back",
    body: input.reason,
    route: "/field/earnings",
  });

  const { data: fresh } = await supabase
    .from("fieldops_commission")
    .select(COMMISSION_COLUMNS)
    .eq("id", input.commissionId)
    .maybeSingle();
  return {
    status: 200,
    message: "Commission reversed.",
    data: mapCommission((fresh ?? before) as unknown as CommissionRow),
  };
}
