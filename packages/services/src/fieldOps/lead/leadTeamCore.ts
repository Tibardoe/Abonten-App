import { maskPhoneNumber } from "@abonten/core/normalizePhoneNumber";
import type {
  FieldOpsMemberRole,
  FieldOpsMemberStatus,
  FieldOpsTeamMember,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  fieldOpsError,
  requireMembership,
  resolveFieldOpsContext,
} from "../shared/fieldOpsContext";
import {
  type FieldOpsEnvelope,
  dbErr,
  displayName,
  namesFor,
  notifyFieldOps,
} from "../shared/fieldOpsRows";

// The team lead's view of their team: who is on it, invite a field member
// by phone, suspend / reactivate / remove one. A lead never sees payout
// details, never adds another lead, and never touches their own row --
// those stay with the admin console (teamAdminCore).

const TEAM_STATUSES = new Set(["draft", "active", "paused"]);

type LeadMemberRow = {
  id: string;
  team_id: string;
  campaign_id: string;
  user_id: string | null;
  invited_phone_e164: string | null;
  full_name_snapshot: string | null;
  role: string;
  status: string;
  joined_at: string | null;
  left_at: string | null;
  suspended_reason: string | null;
  created_at: string;
};

const LEAD_MEMBER_COLUMNS =
  "id, team_id, campaign_id, user_id, invited_phone_e164, full_name_snapshot, role, status, joined_at, left_at, suspended_reason, created_at";

async function mapLeadMembers(
  supabase: ServiceRoleClient,
  rows: LeadMemberRow[],
): Promise<FieldOpsTeamMember[]> {
  const names = await namesFor(
    supabase,
    rows.filter((r) => !r.full_name_snapshot).map((r) => r.user_id),
  );
  return rows.map((r) => ({
    id: r.id,
    teamId: r.team_id,
    campaignId: r.campaign_id,
    userId: r.user_id,
    invitedPhoneMasked: r.invited_phone_e164
      ? maskPhoneNumber(r.invited_phone_e164)
      : null,
    fullName:
      r.full_name_snapshot ??
      (r.user_id ? displayName(names.get(r.user_id)) : null),
    username: r.user_id ? (names.get(r.user_id)?.username ?? null) : null,
    role: r.role as FieldOpsMemberRole,
    status: r.status as FieldOpsMemberStatus,
    joinedAt: r.joined_at,
    leftAt: r.left_at,
    suspendedReason: r.suspended_reason,
    phoneVerified: null,
    payoutDestinationMasked: null,
    createdAt: r.created_at,
  }));
}

export async function listLeadTeamCore(
  supabase: ServiceRoleClient,
  userId: string,
  campaignId: string,
): Promise<FieldOpsEnvelope<FieldOpsTeamMember[]>> {
  let teamId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    teamId = requireMembership(ctx, campaignId, ["team_lead"]).teamId;
  } catch (e) {
    return fieldOpsError(e);
  }
  const { data, error } = await supabase
    .from("fieldops_team_member")
    .select(LEAD_MEMBER_COLUMNS)
    .eq("team_id", teamId)
    .neq("status", "left")
    .order("role")
    .order("status")
    .order("created_at");
  if (error) return dbErr(error, "Could not load the team");
  return {
    status: 200,
    data: await mapLeadMembers(supabase, (data ?? []) as LeadMemberRow[]),
  };
}

export type LeadInviteInput = {
  campaignId: string;
  role: Exclude<FieldOpsMemberRole, "team_lead">;
  invitedPhoneE164: string;
  fullName: string;
};

/**
 * Invites a field member by phone. If a verified account already owns the
 * phone the membership is active at once (and the person is told);
 * otherwise it binds the first time they open /field signed in with it.
 */
export async function inviteTeamMemberCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: LeadInviteInput,
): Promise<FieldOpsEnvelope<FieldOpsTeamMember>> {
  let teamId: string;
  let campaignStatus: string;
  let campaignName: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    const m = requireMembership(ctx, input.campaignId, ["team_lead"]);
    teamId = m.teamId;
    campaignStatus = m.campaignStatus;
    campaignName = m.campaignName;
  } catch (e) {
    return fieldOpsError(e);
  }
  if (!TEAM_STATUSES.has(campaignStatus)) {
    return { status: 409, message: "The campaign isn't taking new members." };
  }
  if (input.role === ("team_lead" as string)) {
    return { status: 403, message: "Only an admin can appoint a team lead." };
  }
  const e164 = `+${input.invitedPhoneE164.replace(/\D/g, "")}`;
  if (!/^\+[1-9][0-9]{6,14}$/.test(e164)) {
    return {
      status: 400,
      message: "Use the international format, e.g. +233241234567",
    };
  }

  const { data: existingId } = await supabase.rpc("get_auth_user_id_by_phone", {
    p_phone: e164.replace("+", ""),
  });
  let row: Record<string, unknown>;
  if (existingId) {
    const uid = existingId as string;
    if (uid === userId) {
      return { status: 400, message: "That's your own phone number." };
    }
    const [{ data: auth }, { data: admin }] = await Promise.all([
      supabase.auth.admin.getUserById(uid),
      supabase
        .from("admin_user")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);
    if (admin) {
      return { status: 409, message: "Platform admins can't be team members." };
    }
    const { data: settings } = await supabase
      .from("fieldops_program_setting")
      .select("require_member_phone_verified")
      .eq("id", 1)
      .maybeSingle();
    const verified = Boolean(auth.user?.phone_confirmed_at);
    if ((settings?.require_member_phone_verified ?? true) && !verified) {
      // Leave it as an invitation; it binds once they verify the phone.
      row = {
        team_id: teamId,
        campaign_id: input.campaignId,
        user_id: null,
        invited_phone_e164: e164,
        full_name_snapshot: input.fullName,
        role: input.role,
        status: "invited",
        added_by: userId,
      };
    } else {
      row = {
        team_id: teamId,
        campaign_id: input.campaignId,
        user_id: uid,
        invited_phone_e164: e164,
        full_name_snapshot: input.fullName,
        role: input.role,
        status: "active",
        joined_at: new Date().toISOString(),
        added_by: userId,
      };
    }
  } else {
    row = {
      team_id: teamId,
      campaign_id: input.campaignId,
      user_id: null,
      invited_phone_e164: e164,
      full_name_snapshot: input.fullName,
      role: input.role,
      status: "invited",
      added_by: userId,
    };
  }

  const { data, error } = await supabase
    .from("fieldops_team_member")
    .insert(row as never)
    .select(LEAD_MEMBER_COLUMNS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return {
        status: 409,
        message: "This person is already on the team (or already invited).",
      };
    }
    return dbErr(
      error ?? { message: "insert failed" },
      "Could not invite the member",
    );
  }
  const [mapped] = await mapLeadMembers(supabase, [data as LeadMemberRow]);
  if (mapped.status === "active" && mapped.userId) {
    await notifyFieldOps(supabase, [mapped.userId], {
      type: "fieldops_membership_added",
      title: `You've joined ${campaignName}`,
      body: "Open Field work to see your assignments.",
      route: "/field",
    });
  }
  return {
    status: 200,
    message:
      mapped.status === "invited"
        ? "Invitation recorded. It activates when they sign in with that phone."
        : "Member added.",
    data: mapped,
  };
}

export async function setLeadMemberStatusCore(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    campaignId: string;
    memberId: string;
    status: "active" | "suspended" | "left";
    reason: string;
  },
): Promise<FieldOpsEnvelope<{ status: string }>> {
  let teamId: string;
  try {
    const ctx = await resolveFieldOpsContext(supabase, userId);
    teamId = requireMembership(ctx, input.campaignId, ["team_lead"]).teamId;
  } catch (e) {
    return fieldOpsError(e);
  }
  const { data: current } = await supabase
    .from("fieldops_team_member")
    .select("id, status, role, user_id, full_name_snapshot")
    .eq("id", input.memberId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!current)
    return { status: 404, message: "Member not found on your team" };
  if (current.role === "team_lead") {
    return { status: 403, message: "Team leads are managed by an admin." };
  }
  if (current.status === "left") {
    return { status: 409, message: "This person has left the team." };
  }
  if (current.status === "invited" && input.status !== "left") {
    return {
      status: 409,
      message: "An invitation can only be withdrawn (remove).",
    };
  }
  if (current.status === input.status) {
    return { status: 400, message: "Nothing changed." };
  }
  const update: Record<string, unknown> = { status: input.status };
  if (input.status === "suspended") update.suspended_reason = input.reason;
  if (input.status === "active") update.suspended_reason = null;
  if (input.status === "left") update.left_at = new Date().toISOString();
  const { error } = await supabase
    .from("fieldops_team_member")
    .update(update as never)
    .eq("id", current.id)
    .eq("status", current.status);
  if (error) return dbErr(error, "Could not update the member");

  if (input.status !== "active") {
    // Their open assignments end with the membership.
    await supabase
      .from("fieldops_assignment")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: `Member ${input.status}: ${input.reason}`,
      } as never)
      .eq("member_id", current.id)
      .in("status", ["assigned", "started"]);
  }
  return {
    status: 200,
    message: "Member updated.",
    data: { status: input.status },
  };
}
