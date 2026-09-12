import { logger } from "@abonten/core/logger";
import type {
  FieldOpsCampaignStats,
  FieldOpsDailyPoint,
  FieldOpsMemberRole,
  FieldOpsMemberStats,
  FieldOpsMemberStatus,
  FieldOpsTerritoryStats,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

// The four analytics RPCs, shaped for the UI. Everything is computed in
// SQL from records the team cannot edit, so these are pure reads: no
// authorization happens here, the caller has already proved who they are.

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export async function loadCampaignStats(
  supabase: ServiceRoleClient,
  campaignId: string,
): Promise<FieldOpsCampaignStats | null> {
  const { data, error } = await supabase.rpc("fieldops_campaign_stats", {
    p_campaign_id: campaignId,
  });
  if (error) {
    logger.error(`fieldOps campaign stats: ${error.message}`);
    return null;
  }
  return (data ?? null) as FieldOpsCampaignStats | null;
}

export async function loadMemberStats(
  supabase: ServiceRoleClient,
  campaignId: string,
): Promise<FieldOpsMemberStats[]> {
  const { data, error } = await supabase.rpc("fieldops_member_stats", {
    p_campaign_id: campaignId,
  });
  if (error) {
    logger.error(`fieldOps member stats: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => ({
    memberId: r.member_id,
    memberUserId: r.member_user_id,
    fullName: r.full_name,
    role: r.role as FieldOpsMemberRole,
    status: r.status as FieldOpsMemberStatus,
    assignedDays: n(r.assigned_days),
    prospects: n(r.prospects),
    submitted: n(r.submitted),
    verified: n(r.verified),
    succeeded: n(r.succeeded),
    rejected: n(r.rejected),
    contentApproved: n(r.content_approved),
    earnedMinor: n(r.earned_minor),
    paidMinor: n(r.paid_minor),
    medianReviewHours:
      r.median_review_hours === null ? null : n(r.median_review_hours),
  }));
}

export async function loadTerritoryStats(
  supabase: ServiceRoleClient,
  campaignId: string,
): Promise<FieldOpsTerritoryStats[]> {
  const { data, error } = await supabase.rpc("fieldops_territory_stats", {
    p_campaign_id: campaignId,
  });
  if (error) {
    logger.error(`fieldOps territory stats: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => ({
    territoryId: r.territory_id,
    name: r.name,
    status: r.status,
    covered: Boolean(r.covered),
    prospects: n(r.prospects),
    contacted: n(r.contacted),
    submitted: n(r.submitted),
    succeeded: n(r.succeeded),
    rejected: n(r.rejected),
  }));
}

export async function loadDailySeries(
  supabase: ServiceRoleClient,
  campaignId: string,
  days = 30,
): Promise<FieldOpsDailyPoint[]> {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  const { data, error } = await supabase.rpc("fieldops_daily_series", {
    p_campaign_id: campaignId,
    p_from: from.toISOString().slice(0, 10),
    p_to: to.toISOString().slice(0, 10),
  });
  if (error) {
    logger.error(`fieldOps daily series: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => ({
    day: r.day,
    submitted: n(r.submitted),
    verified: n(r.verified),
    succeeded: n(r.succeeded),
    rejected: n(r.rejected),
    earnedMinor: n(r.earned_minor),
  }));
}
