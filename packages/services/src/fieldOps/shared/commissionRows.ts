import { logger } from "@abonten/core/logger";
import type {
  FieldOpsActivityKey,
  FieldOpsCommission,
  FieldOpsCommissionEvent,
  FieldOpsCommissionStatus,
  FieldOpsEarningsTotals,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { displayName, namesFor, num } from "./fieldOpsRows";

// Row shapes and mappers for fieldops_commission and its append-only event
// trail. Amounts are minor units throughout and are never recomputed here:
// what the ledger says is what the rule said when the commission was
// earned.

export type CommissionRow = {
  id: string;
  campaign_id: string;
  team_id: string;
  member_id: string;
  member_user_id: string;
  onboarding_id: string | null;
  activity_key: string;
  rule_version: number | null;
  amount_minor: number | string;
  currency: string;
  status: string;
  reverses_commission_id: string | null;
  earned_at: string;
  approved_at: string | null;
  paid_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  created_at: string;
  fieldops_team_member?: { full_name_snapshot: string | null } | null;
  fieldops_onboarding?: { business_name: string | null } | null;
};

export const COMMISSION_COLUMNS =
  "id, campaign_id, team_id, member_id, member_user_id, onboarding_id, activity_key, rule_version, amount_minor, currency, status, reverses_commission_id, earned_at, approved_at, paid_at, rejected_at, rejection_reason, reversed_at, reversal_reason, created_at, fieldops_team_member(full_name_snapshot), fieldops_onboarding(business_name)";

export function mapCommission(r: CommissionRow): FieldOpsCommission {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    teamId: r.team_id,
    memberId: r.member_id,
    memberUserId: r.member_user_id,
    memberName: r.fieldops_team_member?.full_name_snapshot ?? null,
    onboardingId: r.onboarding_id,
    businessName: r.fieldops_onboarding?.business_name ?? null,
    activityKey: r.activity_key as FieldOpsActivityKey,
    ruleVersion: r.rule_version,
    amountMinor: num(r.amount_minor),
    currency: r.currency,
    status: r.status as FieldOpsCommissionStatus,
    reversesCommissionId: r.reverses_commission_id,
    earnedAt: r.earned_at,
    approvedAt: r.approved_at,
    paidAt: r.paid_at,
    rejectedAt: r.rejected_at,
    rejectionReason: r.rejection_reason,
    reversedAt: r.reversed_at,
    reversalReason: r.reversal_reason,
    createdAt: r.created_at,
  };
}

/**
 * Sums a set of commissions per status. Reversal offsets are negative rows
 * carrying status `paid`, so the paid total is already net of money taken
 * back; a reversed original contributes to none of the four buckets.
 */
export function totalsFor(
  commissions: FieldOpsCommission[],
  currency: string,
): FieldOpsEarningsTotals {
  const sum = (status: FieldOpsCommissionStatus) =>
    commissions
      .filter((c) => c.status === status)
      .reduce((t, c) => t + c.amountMinor, 0);
  return {
    pendingMinor: sum("pending"),
    approvedMinor: sum("approved"),
    inPayoutMinor: sum("in_payout"),
    paidMinor: sum("paid"),
    currency,
  };
}

export async function loadCommissionTimeline(
  supabase: ServiceRoleClient,
  commissionId: string,
): Promise<FieldOpsCommissionEvent[]> {
  const { data, error } = await supabase
    .from("fieldops_commission_event")
    .select(
      "id, from_status, to_status, actor_user_id, actor_kind, reason, created_at",
    )
    .eq("commission_id", commissionId)
    .order("id");
  if (error) {
    logger.error(`fieldOps loadCommissionTimeline: ${error.message}`);
    return [];
  }
  const rows = data ?? [];
  const names = await namesFor(
    supabase,
    rows.map((r) => r.actor_user_id),
  );
  return rows.map((r) => ({
    id: Number(r.id),
    fromStatus: r.from_status,
    toStatus: r.to_status,
    actorKind: r.actor_kind as FieldOpsCommissionEvent["actorKind"],
    actorName: r.actor_user_id ? displayName(names.get(r.actor_user_id)) : null,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

/**
 * Records the PENDING commission a lead's verification earns. The SQL
 * function is idempotent and returns nothing when no rule is live or
 * commission generation is switched off — both are normal, and the sweep
 * flags the row rather than inventing an amount.
 */
export async function recordPendingCommission(
  supabase: ServiceRoleClient,
  onboardingId: string,
): Promise<void> {
  const { error } = await supabase.rpc("fieldops_record_pending_commission", {
    p_onboarding_id: onboardingId,
  });
  if (error) {
    // Never fail the lead's decision over the ledger row: the sweep creates
    // it on the next run.
    logger.error(`fieldOps recordPendingCommission: ${error.message}`);
  }
}
