import type {
  FieldOpsContentBrief,
  FieldOpsContentSubmission,
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
  dbErr,
  notifyFieldOps,
} from "../shared/fieldOpsRows";

// The team lead briefs the content creator and reviews what comes back.
// Approving snapshots the live rule and starts a holding period; the sweep
// still decides whether the money becomes payable, exactly as with an
// onboarding. A lead can never review their own work, which the database
// enforces with a CHECK as well.

const PLANNING = new Set(["draft", "active", "winding_down"]);
const REVIEWING = new Set(["active", "paused", "winding_down", "completed"]);

export async function upsertContentBriefCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    briefId?: string;
    title: string;
    description?: string | null;
    platforms?: string[];
    assignedMemberId?: string | null;
    dueOn?: string | null;
    status?: "open" | "closed";
  },
): Promise<FieldOpsEnvelope<FieldOpsContentBrief>> {
  let teamId: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, ["team_lead"]);
    teamId = m.teamId;
    campaignStatus = m.campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!PLANNING.has(campaignStatus)) {
    return { status: 409, message: "The campaign is closed." };
  }

  // An assignment has to point at someone on this lead's own team.
  if (input.assignedMemberId) {
    const { data: member } = await supabase
      .from("fieldops_team_member")
      .select("id, role, status")
      .eq("id", input.assignedMemberId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!member) return { status: 404, message: "Member not found" };
    if (member.role !== "content_creator") {
      return {
        status: 409,
        message: "Briefs go to the content creator.",
      };
    }
  }

  const payload = {
    campaign_id: input.campaignId,
    title: input.title,
    description: input.description ?? null,
    platforms: input.platforms ?? [],
    assigned_member_id: input.assignedMemberId ?? null,
    due_on: input.dueOn ?? null,
    status: input.status ?? "open",
    created_by: userId,
  };

  const q = input.briefId
    ? supabase
        .from("fieldops_content_brief")
        .update(payload as never)
        .eq("id", input.briefId)
        .eq("campaign_id", input.campaignId)
        .select(BRIEF_COLUMNS)
        .maybeSingle()
    : supabase
        .from("fieldops_content_brief")
        .insert(payload as never)
        .select(BRIEF_COLUMNS)
        .single();
  const { data, error } = await q;
  if (error) return dbErr(error, "Could not save the brief");
  if (!data) return { status: 404, message: "Brief not found" };

  // Tell the creator there is something new to make.
  if (!input.briefId && input.assignedMemberId) {
    const { data: creator } = await supabase
      .from("fieldops_team_member")
      .select("user_id")
      .eq("id", input.assignedMemberId)
      .maybeSingle();
    if (creator?.user_id) {
      await notifyFieldOps(supabase, [creator.user_id], {
        type: "fieldops_content_brief",
        title: `New brief: ${input.title}`,
        body: input.description ?? null,
        route: "/field/content",
      });
    }
  }

  return {
    status: 200,
    message: input.briefId ? "Brief updated." : "Brief added.",
    data: mapBrief(data as unknown as BriefRow),
  };
}

export async function listTeamContentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string },
): Promise<
  FieldOpsEnvelope<{
    briefs: FieldOpsContentBrief[];
    submissions: FieldOpsContentSubmission[];
  }>
> {
  let teamId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    teamId = requireMembership(ctx, input.campaignId, ["team_lead"]).teamId;
  } catch (e) {
    return fieldOpsError(e);
  }
  const [{ data: briefs }, { data: subs, error }] = await Promise.all([
    supabase
      .from("fieldops_content_brief")
      .select(BRIEF_COLUMNS)
      .eq("campaign_id", input.campaignId)
      .order("status")
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase
      .from("fieldops_content_submission")
      .select(CONTENT_SUBMISSION_COLUMNS)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (error) return dbErr(error, "Could not load the team's content");

  const rows = ((subs ?? []) as unknown as ContentSubmissionRow[]).map(
    mapContentSubmission,
  );
  // Waiting on the lead first; the rest newest-first.
  rows.sort(
    (a, b) =>
      (a.status === "submitted" ? 0 : 1) - (b.status === "submitted" ? 0 : 1),
  );
  return {
    status: 200,
    data: {
      briefs: ((briefs ?? []) as unknown as BriefRow[]).map(mapBrief),
      submissions: rows,
    },
  };
}

export async function reviewContentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    submissionId: string;
    decision: "approved" | "rejected";
    note?: string | null;
  },
): Promise<FieldOpsEnvelope<FieldOpsContentSubmission>> {
  let teamId: string;
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, ["team_lead"]);
    teamId = m.teamId;
    campaignStatus = m.campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!REVIEWING.has(campaignStatus)) {
    return { status: 409, message: "The campaign is closed." };
  }

  const { data: existing } = await supabase
    .from("fieldops_content_submission")
    .select("id, team_id, member_user_id, status")
    .eq("id", input.submissionId)
    .eq("campaign_id", input.campaignId)
    .maybeSingle();
  if (!existing || existing.team_id !== teamId) {
    return { status: 404, message: "Deliverable not found" };
  }
  if (existing.member_user_id === userId) {
    return { status: 403, message: "You can't review your own content." };
  }

  const { error } = await supabase.rpc("fieldops_review_content", {
    p_submission_id: input.submissionId,
    p_reviewer: userId,
    p_decision: input.decision,
    p_note: input.note ?? undefined,
  });
  if (error) {
    return error.code === "23514"
      ? { status: 409, message: error.message }
      : dbErr(error, "Could not save the decision");
  }

  const { data: fresh } = await supabase
    .from("fieldops_content_submission")
    .select(CONTENT_SUBMISSION_COLUMNS)
    .eq("id", input.submissionId)
    .maybeSingle();
  return {
    status: 200,
    message:
      input.decision === "approved"
        ? "Approved. The commission is confirmed after the holding period."
        : "Rejected.",
    data: mapContentSubmission(fresh as unknown as ContentSubmissionRow),
  };
}
