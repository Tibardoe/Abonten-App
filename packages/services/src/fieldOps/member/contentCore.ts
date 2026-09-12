import type {
  FieldOpsContentSubmission,
  FieldOpsMembership,
  FieldOpsMyContent,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  BRIEF_COLUMNS,
  type BriefRow,
  CONTENT_SUBMISSION_COLUMNS,
  type ContentSubmissionRow,
  mapBrief,
  mapContentSubmission,
} from "../shared/contentRows";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  type FieldOpsEnvelope,
  campaignSummary,
  dbErr,
  notifyFieldOps,
} from "../shared/fieldOpsRows";
import { liveRuleFor } from "../shared/onboardingRows";

// The content creator's own screen: the briefs the campaign has open, the
// deliverables they have sent, and the form to send another. Everyone on
// the campaign can READ the briefs (they are the campaign's ask); only the
// content creator can submit against them.

const LIVE = new Set(["active", "paused", "winding_down"]);
const SUBMITTING = new Set(["active", "winding_down"]);

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

export async function getMyContentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId?: string } = {},
): Promise<FieldOpsEnvelope<FieldOpsMyContent | null>> {
  let membership: FieldOpsMembership;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const picked = pickCampaign(ctx.memberships, input.campaignId);
    if (!picked) return { status: 200, data: null };
    membership = requireMembership(ctx, picked.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }

  const [campaign, { data: briefs, error }, { data: subs }] = await Promise.all(
    [
      campaignSummary(supabase, membership.campaignId),
      supabase
        .from("fieldops_content_brief")
        .select(BRIEF_COLUMNS)
        .eq("campaign_id", membership.campaignId)
        .order("status")
        .order("due_on", { ascending: true, nullsFirst: false })
        .limit(200),
      supabase
        .from("fieldops_content_submission")
        .select(CONTENT_SUBMISSION_COLUMNS)
        .eq("campaign_id", membership.campaignId)
        .eq("member_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
    ],
  );
  if (error) return dbErr(error, "Could not load the content briefs");
  if (!campaign) return { status: 404, message: "Campaign not found" };

  const rule =
    membership.role === "content_creator"
      ? await liveRuleFor(
          supabase,
          membership.campaignId,
          "content_deliverable",
        )
      : null;

  return {
    status: 200,
    data: {
      campaign,
      briefs: ((briefs ?? []) as unknown as BriefRow[]).map(mapBrief),
      submissions: ((subs ?? []) as unknown as ContentSubmissionRow[]).map(
        mapContentSubmission,
      ),
      liveRate: rule
        ? { amountMinor: rule.amountMinor, currency: rule.currency }
        : null,
      canSubmit:
        membership.role === "content_creator" &&
        SUBMITTING.has(membership.campaignStatus),
    },
  };
}

export async function submitContentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    briefId?: string | null;
    platform: string;
    url: string;
    caption?: string | null;
    postedAt?: string | null;
    selfReportedMetrics?: { views?: number; likes?: number; shares?: number };
  },
): Promise<FieldOpsEnvelope<FieldOpsContentSubmission>> {
  let m: FieldOpsMembership;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    m = requireMembership(ctx, input.campaignId, ["content_creator"]);
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!SUBMITTING.has(m.campaignStatus)) {
    return {
      status: 409,
      message: "The campaign isn't taking content right now.",
    };
  }

  // A brief, when given, has to belong to this campaign.
  if (input.briefId) {
    const { data: brief } = await supabase
      .from("fieldops_content_brief")
      .select("id, status")
      .eq("id", input.briefId)
      .eq("campaign_id", input.campaignId)
      .maybeSingle();
    if (!brief) return { status: 404, message: "Brief not found" };
    if (brief.status === "closed") {
      return { status: 409, message: "That brief is closed." };
    }
  }

  const { data, error } = await supabase
    .from("fieldops_content_submission")
    .insert({
      campaign_id: input.campaignId,
      team_id: m.teamId,
      brief_id: input.briefId ?? null,
      member_id: m.membershipId,
      member_user_id: userId,
      platform: input.platform,
      url: input.url,
      caption: input.caption ?? null,
      posted_at: input.postedAt ?? new Date().toISOString(),
      self_reported_metrics: input.selfReportedMetrics ?? {},
    } as never)
    .select(CONTENT_SUBMISSION_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        status: 409,
        message: "That post has already been sent in.",
      };
    }
    return dbErr(error, "Could not send the deliverable");
  }

  const { data: leads } = await supabase
    .from("fieldops_team_member")
    .select("user_id")
    .eq("team_id", m.teamId)
    .eq("role", "team_lead")
    .eq("status", "active");
  await notifyFieldOps(
    supabase,
    (leads ?? [])
      .map((l) => l.user_id)
      .filter((id): id is string => Boolean(id)),
    {
      type: "fieldops_content_received",
      title: "New content to review",
      body: "The content creator sent in a deliverable.",
      route: "/field/lead/content",
    },
  );

  return {
    status: 200,
    message: "Sent for review.",
    data: mapContentSubmission(data as unknown as ContentSubmissionRow),
  };
}
