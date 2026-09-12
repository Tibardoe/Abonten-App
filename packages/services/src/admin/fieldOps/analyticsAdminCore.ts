import type { AdminContext } from "@abonten/types/adminTypes";
import type { FieldOpsAnalytics } from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  loadCampaignStats,
  loadDailySeries,
  loadMemberStats,
  loadTerritoryStats,
} from "../../fieldOps/shared/analyticsRows";
import { campaignSummary } from "../../fieldOps/shared/fieldOpsRows";
import { type AdminEnvelope, assertPermission } from "../adminContext";
import { denied } from "./fieldOpsAdminShared";

// Admin > Field Ops > campaign analytics. Read-only, computed live; the
// volumes involved (a dozen people, low thousands of rows per campaign)
// do not justify a rollup table, and a live figure cannot go stale.

export async function getCampaignAnalyticsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  campaignId: string,
  days = 30,
): Promise<AdminEnvelope<FieldOpsAnalytics>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const [campaign, stats, members, territories, daily] = await Promise.all([
    campaignSummary(supabase, campaignId),
    loadCampaignStats(supabase, campaignId),
    loadMemberStats(supabase, campaignId),
    loadTerritoryStats(supabase, campaignId),
    loadDailySeries(supabase, campaignId, days),
  ]);
  if (!campaign || !stats) {
    return { status: 404, message: "Campaign not found" };
  }
  return {
    status: 200,
    data: { campaign, stats, members, territories, daily },
  };
}

/**
 * The same numbers as a spreadsheet. One row per member, so a manager can
 * sort and total it however they like without asking for a new screen.
 */
export async function exportCampaignStatsCsvCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  campaignId: string,
): Promise<AdminEnvelope<{ filename: string; csv: string }>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const [campaign, members] = await Promise.all([
    campaignSummary(supabase, campaignId),
    loadMemberStats(supabase, campaignId),
  ]);
  if (!campaign) return { status: 404, message: "Campaign not found" };

  const cell = (v: string | null) => {
    const s = v ?? "";
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header =
    "member,role,status,assigned_days,prospects,submitted,verified,succeeded,rejected,content_approved,earned,paid,median_review_hours";
  const lines = members.map((m) =>
    [
      cell(m.fullName),
      m.role,
      m.status,
      String(m.assignedDays),
      String(m.prospects),
      String(m.submitted),
      String(m.verified),
      String(m.succeeded),
      String(m.rejected),
      String(m.contentApproved),
      (m.earnedMinor / 100).toFixed(2),
      (m.paidMinor / 100).toFixed(2),
      m.medianReviewHours === null ? "" : String(m.medianReviewHours),
    ].join(","),
  );
  return {
    status: 200,
    data: {
      filename: `fieldops-${campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-team.csv`,
      csv: [header, ...lines].join("\n"),
    },
  };
}
