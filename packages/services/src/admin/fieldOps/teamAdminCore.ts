import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  FieldOpsMemberRole,
  FieldOpsTeamMember,
} from "@abonten/types/fieldOps";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import {
  MEMBER_COLUMNS,
  type MemberRow,
  type RequestMeta,
  dbError,
  denied,
  mapMembers,
  readSettings,
} from "./fieldOpsAdminShared";

// Team membership (Admin > Field Ops > Campaign > Team). A member is an
// ordinary Abonten account (or a phone number that becomes one when the
// person signs in); never an admin_user. Payout numbers are masked here and
// never sent to a client.

export async function listTeamMembersCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  campaignId: string,
): Promise<AdminEnvelope<FieldOpsTeamMember[]>> {
  try {
    assertPermission(ctx, "fieldops.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("fieldops_team_member")
    .select(MEMBER_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("role")
    .order("status")
    .order("created_at");
  if (error) return dbError(error, "Could not load the team");
  return {
    status: 200,
    data: await mapMembers(supabase, (data ?? []) as unknown as MemberRow[], {
      includePhoneVerified: true,
    }),
  };
}

export type AddMemberInput = {
  campaignId: string;
  role: FieldOpsMemberRole;
  userId?: string | null;
  invitedPhoneE164?: string | null;
  fullName?: string | null;
};

/**
 * Adds a member by existing user id (active at once, if their phone is
 * verified or the programme doesn't require it) or by phone number (an
 * invitation that binds when someone with that verified phone opens
 * /field). Refuses admins: the programme's people must never carry
 * is_admin bypasses.
 */
export async function addTeamMemberCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: AddMemberInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string; status: string }>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }
  const { data: team } = await supabase
    .from("fieldops_team")
    .select("id, campaign_id")
    .eq("campaign_id", input.campaignId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!team) return { status: 404, message: "Campaign has no team" };

  const settings = await readSettings(supabase);
  const requirePhone = settings?.requireMemberPhoneVerified ?? true;

  let row: Record<string, unknown>;
  let summary: string;

  if (input.userId) {
    const [{ data: profile }, { data: auth }, { data: admin }] =
      await Promise.all([
        supabase
          .from("user_info")
          .select("id, full_name, username")
          .eq("id", input.userId)
          .maybeSingle(),
        supabase.auth.admin.getUserById(input.userId),
        supabase
          .from("admin_user")
          .select("user_id")
          .eq("user_id", input.userId)
          .maybeSingle(),
      ]);
    if (!profile) return { status: 404, message: "User not found" };
    if (admin) {
      return {
        status: 409,
        message:
          "Platform admins can't be team members. Use the admin console for their work.",
      };
    }
    const phoneVerified = Boolean(auth.user?.phone_confirmed_at);
    if (requirePhone && !phoneVerified) {
      return {
        status: 409,
        message:
          "This account has no verified phone number. Ask them to add one under Settings › Security, or invite them by phone.",
      };
    }
    row = {
      team_id: team.id,
      campaign_id: input.campaignId,
      user_id: input.userId,
      full_name_snapshot:
        input.fullName ?? profile.full_name ?? profile.username,
      role: input.role,
      status: "active",
      joined_at: new Date().toISOString(),
      added_by: ctx.userId,
    };
    summary = `${profile.full_name ?? profile.username ?? input.userId} added as ${input.role}`;
  } else if (input.invitedPhoneE164) {
    // The schema already requires E.164 (+ and 7-15 digits); normalise the
    // spacing defensively so "+233 24 …" and "+23324…" are the same invite.
    const e164 = `+${input.invitedPhoneE164.replace(/\D/g, "")}`;
    if (!/^\+[1-9][0-9]{6,14}$/.test(e164)) {
      return {
        status: 400,
        message: "Use the international format, e.g. +233241234567",
      };
    }
    const normalized = { e164 };
    // If the phone already belongs to a verified account, bind now.
    const { data: existingId } = await supabase.rpc(
      "get_auth_user_id_by_phone",
      {
        p_phone: e164.replace("+", ""),
      },
    );
    if (existingId) {
      return addTeamMemberCore(
        supabase,
        ctx,
        { ...input, userId: existingId as string, invitedPhoneE164: null },
        requestMeta,
      );
    }
    row = {
      team_id: team.id,
      campaign_id: input.campaignId,
      user_id: null,
      invited_phone_e164: normalized.e164,
      full_name_snapshot: input.fullName ?? null,
      role: input.role,
      status: "invited",
      added_by: ctx.userId,
    };
    summary = `${input.fullName ?? normalized.e164} invited as ${input.role}`;
  } else {
    return { status: 400, message: "Pick a user or enter a phone number." };
  }

  const { data, error } = await supabase
    .from("fieldops_team_member")
    .insert(row as never)
    .select("id, status")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return {
        status: 409,
        message: error.message.includes("one_lead")
          ? "This team already has an active team lead."
          : "This person is already on the team (or already invited).",
      };
    }
    return dbError(
      error ?? { message: "insert failed" },
      "Could not add the member",
    );
  }

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.member.add",
    targetType: "fieldops_team_member",
    targetId: data.id,
    summary,
    after: {
      campaignId: input.campaignId,
      role: input.role,
      userId: input.userId ?? null,
      invited: Boolean(input.invitedPhoneE164),
    },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message:
      data.status === "invited"
        ? "Invitation recorded. It binds when they sign in with that phone."
        : "Member added.",
    data: { id: data.id, status: data.status },
  };
}

export async function setTeamMemberStatusCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    memberId: string;
    status: "active" | "suspended" | "left";
    reason: string;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ status: string }>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }
  const { data: current } = await supabase
    .from("fieldops_team_member")
    .select("id, status, role, user_id, full_name_snapshot")
    .eq("id", input.memberId)
    .maybeSingle();
  if (!current) return { status: 404, message: "Member not found" };
  if (current.status === "left") {
    return { status: 409, message: "This person has left the team." };
  }
  if (current.status === "invited" && input.status !== "left") {
    return {
      status: 409,
      message: "An invitation can only be withdrawn (mark as left).",
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
    .eq("id", input.memberId)
    .eq("status", current.status);
  if (error) return dbError(error, "Could not update the member");

  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: `fieldops.member.${input.status}`,
    targetType: "fieldops_team_member",
    targetId: input.memberId,
    summary: `${current.full_name_snapshot ?? current.user_id ?? "Member"}: ${current.status} → ${input.status}`,
    reason: input.reason,
    before: { status: current.status },
    after: { status: input.status },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message: "Member updated.",
    data: { status: input.status },
  };
}

export async function setTeamMemberRoleCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { memberId: string; role: FieldOpsMemberRole; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ role: FieldOpsMemberRole }>> {
  try {
    assertPermission(ctx, "fieldops.manage");
  } catch (e) {
    return denied(e);
  }
  const { data: current } = await supabase
    .from("fieldops_team_member")
    .select("id, role, status, full_name_snapshot, user_id")
    .eq("id", input.memberId)
    .maybeSingle();
  if (!current) return { status: 404, message: "Member not found" };
  if (current.status === "left") {
    return { status: 409, message: "This person has left the team." };
  }
  if (current.role === input.role) {
    return { status: 400, message: "Nothing changed." };
  }
  const { error } = await supabase
    .from("fieldops_team_member")
    .update({ role: input.role } as never)
    .eq("id", input.memberId);
  if (error) {
    if (error.code === "23505") {
      return {
        status: 409,
        message: "This team already has an active team lead.",
      };
    }
    return dbError(error, "Could not change the role");
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "fieldops.member.role",
    targetType: "fieldops_team_member",
    targetId: input.memberId,
    summary: `${current.full_name_snapshot ?? current.user_id ?? "Member"}: ${current.role} → ${input.role}`,
    reason: input.reason,
    before: { role: current.role },
    after: { role: input.role },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Role changed.", data: { role: input.role } };
}
