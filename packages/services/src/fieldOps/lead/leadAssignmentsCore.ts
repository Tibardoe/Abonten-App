import type {
  FieldOpsAssignment,
  FieldOpsAssignmentStatus,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  ASSIGNMENT_COLUMNS,
  type AssignmentRow,
  type FieldOpsEnvelope,
  dbErr,
  mapAssignments,
  notifyFieldOps,
  todayIso,
} from "../shared/fieldOpsRows";

// The team lead plans the work: who works which territory on which days.
// Assignments may be planned while the campaign is a draft or active;
// reassigning is cancel + a new row so the history stays whole.

const PLANNING_STATUSES = new Set(["draft", "active"]);

export async function listLeadAssignmentsCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    date?: string;
    status?: FieldOpsAssignmentStatus;
  },
): Promise<FieldOpsEnvelope<FieldOpsAssignment[]>> {
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    requireMembership(ctx, input.campaignId, ["team_lead"]);
  } catch (e) {
    return fieldOpsError(e);
  }
  let query = supabase
    .from("fieldops_assignment")
    .select(ASSIGNMENT_COLUMNS)
    .eq("campaign_id", input.campaignId)
    .order("starts_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (input.date) {
    query = query.lte("starts_on", input.date).gte("ends_on", input.date);
  }
  if (input.status) query = query.eq("status", input.status);
  const { data, error } = await query;
  if (error) return dbErr(error, "Could not load assignments");
  return {
    status: 200,
    data: await mapAssignments(supabase, (data ?? []) as AssignmentRow[]),
  };
}

export type CreateAssignmentInput = {
  campaignId: string;
  memberId: string;
  territoryId: string;
  startsOn: string;
  endsOn: string;
  notes?: string | null;
};

export async function createAssignmentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: CreateAssignmentInput,
): Promise<FieldOpsEnvelope<FieldOpsAssignment>> {
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
  if (!PLANNING_STATUSES.has(campaignStatus)) {
    return {
      status: 409,
      message:
        campaignStatus === "paused"
          ? "The campaign is paused; no new assignments until it resumes."
          : "The campaign isn't taking new assignments.",
    };
  }
  if (input.endsOn < todayIso()) {
    return { status: 400, message: "The end date is in the past." };
  }
  const { data: member } = await supabase
    .from("fieldops_team_member")
    .select("id, user_id, role, status, full_name_snapshot")
    .eq("id", input.memberId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!member) return { status: 404, message: "Member not found on your team" };
  if (member.status !== "active" || !member.user_id) {
    return { status: 409, message: "That member isn't active." };
  }
  if (member.role !== "offline_member" && member.role !== "online_member") {
    return {
      status: 409,
      message: "Only offline and online members take territory assignments.",
    };
  }
  const { data: territory } = await supabase
    .from("fieldops_territory")
    .select("id, name, status")
    .eq("id", input.territoryId)
    .maybeSingle();
  if (!territory) return { status: 404, message: "Territory not found" };
  if (territory.status !== "active") {
    return { status: 409, message: "That territory isn't active." };
  }

  const { data, error } = await supabase
    .from("fieldops_assignment")
    .insert({
      campaign_id: input.campaignId,
      team_id: teamId,
      member_id: member.id,
      member_user_id: member.user_id,
      territory_id: input.territoryId,
      mode: member.role === "offline_member" ? "offline" : "online",
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      assigned_by: userId,
      notes: input.notes ?? null,
    } as never)
    .select(ASSIGNMENT_COLUMNS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return {
        status: 409,
        message: `${member.full_name_snapshot ?? "This member"} already has an open assignment in ${territory.name}. Cancel it first to reassign.`,
      };
    }
    return dbErr(
      error ?? { message: "insert failed" },
      "Could not create the assignment",
    );
  }
  const [mapped] = await mapAssignments(supabase, [data as AssignmentRow]);
  await notifyFieldOps(supabase, [member.user_id], {
    type: "fieldops_assignment_created",
    title: `New assignment: ${territory.name}`,
    body:
      input.startsOn === input.endsOn
        ? `You're on ${territory.name} on ${input.startsOn}.`
        : `You're on ${territory.name} from ${input.startsOn} to ${input.endsOn}.`,
    route: "/field",
  });
  return { status: 200, message: "Assignment created.", data: mapped };
}

export async function cancelAssignmentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; assignmentId: string; reason: string },
): Promise<FieldOpsEnvelope<FieldOpsAssignment>> {
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    campaignStatus = requireMembership(ctx, input.campaignId, [
      "team_lead",
    ]).campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (campaignStatus === "archived") {
    return { status: 409, message: "The campaign is archived." };
  }
  const { data: current } = await supabase
    .from("fieldops_assignment")
    .select("id, status, member_user_id, fieldops_territory(name)")
    .eq("id", input.assignmentId)
    .eq("campaign_id", input.campaignId)
    .maybeSingle();
  if (!current) return { status: 404, message: "Assignment not found" };
  if (current.status !== "assigned" && current.status !== "started") {
    return { status: 409, message: "This assignment is already closed." };
  }
  const { data, error } = await supabase
    .from("fieldops_assignment")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: input.reason,
    } as never)
    .eq("id", current.id)
    .in("status", ["assigned", "started"])
    .select(ASSIGNMENT_COLUMNS)
    .maybeSingle();
  if (error) return dbErr(error, "Could not cancel the assignment");
  if (!data) return { status: 409, message: "This assignment just changed." };
  const [mapped] = await mapAssignments(supabase, [data as AssignmentRow]);
  const territoryName =
    (current.fieldops_territory as unknown as { name: string } | null)?.name ??
    "a territory";
  await notifyFieldOps(supabase, [current.member_user_id], {
    type: "fieldops_assignment_changed",
    title: `Assignment cancelled: ${territoryName}`,
    body: input.reason,
    route: "/field/assignments",
  });
  return { status: 200, message: "Assignment cancelled.", data: mapped };
}
