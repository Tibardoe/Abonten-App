import type { FieldOpsAnalytics } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  loadCampaignStats,
  loadDailySeries,
  loadMemberStats,
  loadTerritoryStats,
} from "../shared/analyticsRows";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import { type FieldOpsEnvelope, campaignSummary } from "../shared/fieldOpsRows";

// The lead's performance page: the same figures the admin console shows,
// scoped to their own campaign. Read-only and computed live, so there is
// nothing here a lead could nudge in their own favour.

export async function getLeadPerformanceCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; days?: number },
): Promise<FieldOpsEnvelope<FieldOpsAnalytics>> {
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    requireMembership(ctx, input.campaignId, ["team_lead"]);
  } catch (e) {
    return fieldOpsError(e);
  }
  const [campaign, stats, members, territories, daily] = await Promise.all([
    campaignSummary(supabase, input.campaignId),
    loadCampaignStats(supabase, input.campaignId),
    loadMemberStats(supabase, input.campaignId),
    loadTerritoryStats(supabase, input.campaignId),
    loadDailySeries(supabase, input.campaignId, input.days ?? 30),
  ]);
  if (!campaign || !stats) {
    return { status: 404, message: "Campaign not found" };
  }
  return {
    status: 200,
    data: { campaign, stats, members, territories, daily },
  };
}
