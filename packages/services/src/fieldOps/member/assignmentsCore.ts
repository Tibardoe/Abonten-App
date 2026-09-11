import { distanceMetres } from "@abonten/core/fieldOps/territory";
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
  pointWkt,
  todayIso,
} from "../shared/fieldOpsRows";

// A member's own assignments: list, start (GPS check-in for offline work),
// complete. Leads create and cancel them (lead/leadAssignmentsCore). The
// campaign status gates what may happen (plan §6): starting needs an
// active campaign; completing is allowed while it is active, paused or
// winding down.

const FIELD_ROLES = ["offline_member", "online_member"] as const;

export async function listMyAssignmentsCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; status?: FieldOpsAssignmentStatus },
): Promise<FieldOpsEnvelope<FieldOpsAssignment[]>> {
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    requireMembership(ctx, input.campaignId);
  } catch (e) {
    return fieldOpsError(e);
  }
  let query = supabase
    .from("fieldops_assignment")
    .select(ASSIGNMENT_COLUMNS)
    .eq("campaign_id", input.campaignId)
    .eq("member_user_id", userId)
    .order("starts_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (input.status) query = query.eq("status", input.status);
  const { data, error } = await query;
  if (error) return dbErr(error, "Could not load your assignments");
  return {
    status: 200,
    data: await mapAssignments(supabase, (data ?? []) as AssignmentRow[]),
  };
}

async function ownAssignment(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
  assignmentId: string,
): Promise<AssignmentRow | null> {
  const { data } = await supabase
    .from("fieldops_assignment")
    .select(ASSIGNMENT_COLUMNS)
    .eq("id", assignmentId)
    .eq("campaign_id", campaignId)
    .eq("member_user_id", userId)
    .maybeSingle();
  return (data as AssignmentRow | null) ?? null;
}

export type StartAssignmentInput = {
  campaignId: string;
  assignmentId: string;
  location?: { lat: number; lng: number } | null;
  accuracyM?: number | null;
};

/**
 * Starts an assignment for today. Offline members must send the device's
 * position (it is recorded with the distance to the territory centre and
 * shown to the lead; nothing is refused on it). Online members just start.
 */
export async function startAssignmentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: StartAssignmentInput,
): Promise<FieldOpsEnvelope<FieldOpsAssignment>> {
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    campaignStatus = requireMembership(
      ctx,
      input.campaignId,
      FIELD_ROLES,
    ).campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (campaignStatus !== "active") {
    return {
      status: 409,
      message:
        campaignStatus === "paused"
          ? "The campaign is paused. Wait for your team lead."
          : "The campaign isn't taking new work right now.",
    };
  }
  const row = await ownAssignment(
    supabase,
    userId,
    input.campaignId,
    input.assignmentId,
  );
  if (!row) return { status: 404, message: "Assignment not found" };
  if (row.status !== "assigned") {
    return {
      status: 409,
      message:
        row.status === "started"
          ? "You've already started this assignment."
          : "This assignment is no longer open.",
    };
  }
  const today = todayIso();
  if (today < row.starts_on) {
    return {
      status: 409,
      message: `This assignment starts on ${row.starts_on}.`,
    };
  }
  if (today > row.ends_on) {
    return { status: 409, message: "This assignment's dates have passed." };
  }

  let startDistanceM: number | null = null;
  if (row.mode === "offline") {
    if (!input.location) {
      return {
        status: 400,
        message:
          "Turn on location so we can record where you started, then try again.",
      };
    }
    const { data: territory } = await supabase
      .from("fieldops_territory")
      .select("centre_lat, centre_lng")
      .eq("id", row.territory_id)
      .maybeSingle();
    if (territory?.centre_lat !== null && territory?.centre_lng !== null) {
      startDistanceM = Math.round(
        distanceMetres(input.location, {
          lat: territory?.centre_lat ?? 0,
          lng: territory?.centre_lng ?? 0,
        }),
      );
    }
  }

  const { data, error } = await supabase
    .from("fieldops_assignment")
    .update({
      status: "started",
      started_at: new Date().toISOString(),
      start_location: input.location ? pointWkt(input.location) : null,
      start_accuracy_m:
        input.accuracyM === null || input.accuracyM === undefined
          ? null
          : Math.round(input.accuracyM),
      start_distance_m: startDistanceM,
    } as never)
    .eq("id", row.id)
    .eq("status", "assigned")
    .select(ASSIGNMENT_COLUMNS)
    .maybeSingle();
  if (error) return dbErr(error, "Could not start the assignment");
  if (!data) {
    return { status: 409, message: "This assignment was just changed." };
  }
  const [mapped] = await mapAssignments(supabase, [data as AssignmentRow]);
  return { status: 200, message: "Assignment started.", data: mapped };
}

export async function completeAssignmentCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: { campaignId: string; assignmentId: string },
): Promise<FieldOpsEnvelope<FieldOpsAssignment>> {
  let campaignStatus: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    campaignStatus = requireMembership(
      ctx,
      input.campaignId,
      FIELD_ROLES,
    ).campaignStatus;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!["active", "paused", "winding_down"].includes(campaignStatus)) {
    return { status: 409, message: "The campaign is closed." };
  }
  const row = await ownAssignment(
    supabase,
    userId,
    input.campaignId,
    input.assignmentId,
  );
  if (!row) return { status: 404, message: "Assignment not found" };
  if (row.status !== "started") {
    return {
      status: 409,
      message:
        row.status === "assigned"
          ? "Start the assignment before completing it."
          : "This assignment is no longer open.",
    };
  }
  const { data, error } = await supabase
    .from("fieldops_assignment")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id)
    .eq("status", "started")
    .select(ASSIGNMENT_COLUMNS)
    .maybeSingle();
  if (error) return dbErr(error, "Could not complete the assignment");
  if (!data) {
    return { status: 409, message: "This assignment was just changed." };
  }
  const [mapped] = await mapAssignments(supabase, [data as AssignmentRow]);
  return { status: 200, message: "Assignment completed.", data: mapped };
}
