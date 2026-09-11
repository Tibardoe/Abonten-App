import type {
  FieldOpsMembership,
  FieldOpsMyEarnings,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  COMMISSION_COLUMNS,
  type CommissionRow,
  mapCommission,
  totalsFor,
} from "../shared/commissionRows";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  type FieldOpsEnvelope,
  campaignSummary,
  dbErr,
} from "../shared/fieldOpsRows";
import { liveRuleFor } from "../shared/onboardingRows";

// What a member sees on /field/earnings: their own commission lines and the
// four money buckets. Read-only — nothing here can change an amount or a
// status. A member reads only their own rows (the service filters by their
// membership; RLS would too if they queried directly).

const LIVE = new Set(["active", "paused", "winding_down"]);

function pickCampaign(
  memberships: FieldOpsMembership[],
  campaignId?: string,
): FieldOpsMembership | null {
  if (campaignId) {
    return memberships.find((m) => m.campaignId === campaignId) ?? null;
  }
  const usable = memberships.filter((m) => m.campaignStatus !== "archived");
  return usable.find((m) => LIVE.has(m.campaignStatus)) ?? usable[0] ?? null;
}

export async function getMyEarningsCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId?: string } = {},
): Promise<FieldOpsEnvelope<FieldOpsMyEarnings | null>> {
  let membership: FieldOpsMembership;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const picked = pickCampaign(ctx.memberships, input.campaignId);
    if (!picked) return { status: 200, data: null };
    membership = requireMembership(ctx, picked.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }

  const [campaign, { data, error }, { data: holding }] = await Promise.all([
    campaignSummary(supabase, membership.campaignId),
    supabase
      .from("fieldops_commission")
      .select(COMMISSION_COLUMNS)
      .eq("campaign_id", membership.campaignId)
      .eq("member_user_id", userId)
      .order("earned_at", { ascending: false })
      .limit(300),
    supabase
      .from("fieldops_onboarding")
      .select("holding_until")
      .eq("member_user_id", userId)
      .eq("campaign_id", membership.campaignId)
      .eq("status", "verified")
      .not("holding_until", "is", null)
      .order("holding_until", { ascending: true })
      .limit(1),
  ]);
  if (error) return dbErr(error, "Could not load your earnings");
  if (!campaign) return { status: 404, message: "Campaign not found" };

  const commissions = ((data ?? []) as unknown as CommissionRow[]).map(
    mapCommission,
  );

  // The rate the member would earn today, for the "you earn X" line. Their
  // role fixes the activity: offline members work in person, online members
  // over the phone.
  const activityKey =
    membership.role === "offline_member"
      ? "place_onboarding_offline"
      : "place_onboarding_online";
  const rule =
    membership.role === "offline_member" || membership.role === "online_member"
      ? await liveRuleFor(supabase, membership.campaignId, activityKey)
      : null;

  return {
    status: 200,
    data: {
      campaign,
      totals: totalsFor(commissions, campaign.currency),
      commissions,
      nextReleaseAt: holding?.[0]?.holding_until ?? null,
      liveRate: rule
        ? { amountMinor: rule.amountMinor, currency: rule.currency }
        : null,
    },
  };
}
