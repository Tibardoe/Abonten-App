import { ROLE_PERMISSIONS } from "@abonten/core/adminPermissions";
import { logger } from "@abonten/core/logger";
import type {
  AdminContext,
  AdminPermissionKey,
  AdminRoleKey,
} from "@abonten/types/adminTypes";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AdminEnvelope,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin Settings backend: view the role/permission matrix, list admin
// staff, and (super-admin only, via the admins.manage-guarded RPCs) grant /
// revoke roles and enable / disable admin accounts.

export type AdminStaffRow = {
  userId: string;
  username: string | null;
  fullName: string | null;
  email: string | null;
  status: "active" | "disabled";
  roles: AdminRoleKey[];
  createdAt: string;
};

export async function listAdminStaffCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<AdminStaffRow[]>> {
  try {
    assertPermission(ctx, "settings.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: admins, error } = await supabase
    .from("admin_user")
    .select("user_id, status, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    logger.error(`listAdminStaffCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  const ids = (admins ?? []).map((a) => a.user_id);
  const [{ data: roleRows }, { data: profiles }] = await Promise.all([
    supabase
      .from("admin_user_role")
      .select("user_id, role_key")
      .in("user_id", ids),
    supabase.from("user_info").select("id, username, full_name").in("id", ids),
  ]);
  const rolesByUser = new Map<string, AdminRoleKey[]>();
  for (const r of roleRows ?? []) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r.role_key as AdminRoleKey);
    rolesByUser.set(r.user_id, arr);
  }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const canPii =
    ctx.permissions.includes("users.view_pii") ||
    ctx.permissions.includes("admins.manage");
  const rows: AdminStaffRow[] = await Promise.all(
    (admins ?? []).map(async (a) => {
      let email: string | null = null;
      if (canPii) {
        const { data } = await supabase.auth.admin.getUserById(a.user_id);
        email = data?.user?.email ?? null;
      }
      const p = profileById.get(a.user_id);
      return {
        userId: a.user_id,
        username: p?.username ?? null,
        fullName: p?.full_name ?? null,
        email,
        status: a.status,
        roles: rolesByUser.get(a.user_id) ?? [],
        createdAt: a.created_at,
      };
    }),
  );

  return { status: 200, data: rows };
}

export function getRoleMatrixCore(
  ctx: AdminContext,
): AdminEnvelope<Record<AdminRoleKey, AdminPermissionKey[]>> {
  try {
    assertPermission(ctx, "settings.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  return { status: 200, data: ROLE_PERMISSIONS };
}

export async function grantAdminRoleCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  input: { targetUserId: string; roleKey: AdminRoleKey },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "admins.manage");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const { error } = await supabase.rpc("grant_admin_role", {
    p_actor_id: ctx.userId,
    p_target_user: input.targetUserId,
    p_role_key: input.roleKey,
  });
  if (error) {
    logger.error(`grantAdminRoleCore failed: ${error.message}`);
    if (error.code === "42501")
      return { status: 403, message: "Not authorized" };
    return { status: 500, message: "Something went wrong" };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "admin.role.grant",
    targetType: "admin_user",
    targetId: input.targetUserId,
    summary: `Granted role ${input.roleKey}`,
    after: { role: input.roleKey },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: `Granted ${input.roleKey}.` };
}

export async function revokeAdminRoleCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  input: { targetUserId: string; roleKey: AdminRoleKey },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "admins.manage");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const { error } = await supabase.rpc("revoke_admin_role", {
    p_actor_id: ctx.userId,
    p_target_user: input.targetUserId,
    p_role_key: input.roleKey,
  });
  if (error) {
    logger.error(`revokeAdminRoleCore failed: ${error.message}`);
    if (error.code === "42501")
      return { status: 403, message: "Not authorized" };
    return { status: 500, message: "Something went wrong" };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "admin.role.revoke",
    targetType: "admin_user",
    targetId: input.targetUserId,
    summary: `Revoked role ${input.roleKey}`,
    before: { role: input.roleKey },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: `Revoked ${input.roleKey}.` };
}

export async function setAdminUserStatusCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  input: { targetUserId: string; status: "active" | "disabled" },
  requestMeta?: Record<string, unknown>,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "admins.manage");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  if (input.targetUserId === ctx.userId && input.status === "disabled") {
    return {
      status: 400,
      message: "You can't disable your own admin account.",
    };
  }
  const { error } = await supabase.rpc("set_admin_user_status", {
    p_actor_id: ctx.userId,
    p_target_user: input.targetUserId,
    p_status: input.status,
  });
  if (error) {
    logger.error(`setAdminUserStatusCore failed: ${error.message}`);
    if (error.code === "42501")
      return { status: 403, message: "Not authorized" };
    return { status: 500, message: "Something went wrong" };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "admin.status",
    targetType: "admin_user",
    targetId: input.targetUserId,
    summary: `Admin account -> ${input.status}`,
    after: { status: input.status },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: `Admin account ${input.status}.` };
}
