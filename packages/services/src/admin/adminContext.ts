import {
  ADMIN_PERMISSION_KEYS,
  AdminForbiddenError,
  AdminUnauthenticatedError,
  effectivePermissions,
} from "@abonten/core/adminPermissions";
import { logger } from "@abonten/core/logger";
import type {
  AdminContext,
  AdminPermissionKey,
  AdminRoleKey,
} from "@abonten/types/adminTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

export { AdminForbiddenError, AdminUnauthenticatedError };

// The one authorization primitive for every admin service. The transport
// (apps/admin server action / route handler) resolves the caller's user id
// from its Supabase SSR session, then passes it here along with a
// SERVICE-ROLE client. This function re-derives the caller's staff status
// and roles straight from the DB every time — a disabled admin, or one
// whose roles changed mid-session, is reflected immediately.
//
// Throws AdminUnauthenticatedError (401) if not signed in / not staff, so
// callers can `catch` and map to an envelope. Never trusts anything the
// client sent about roles or permissions.
export async function resolveAdminContext(
  serviceClient: SupabaseClient,
  userId: string | null | undefined,
  opts?: { email?: string | null; reauthenticatedAt?: number | null },
): Promise<AdminContext> {
  if (!userId) throw new AdminUnauthenticatedError();

  const { data: adminUser, error: auErr } = await serviceClient
    .from("admin_user")
    .select("user_id, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (auErr) {
    logger.error(
      `resolveAdminContext: admin_user lookup failed: ${auErr.message}`,
    );
    throw new AdminUnauthenticatedError("Could not verify admin access");
  }
  if (!adminUser || adminUser.status !== "active") {
    throw new AdminUnauthenticatedError("Not an active administrator");
  }

  const { data: roleRows, error: roleErr } = await serviceClient
    .from("admin_user_role")
    .select("role_key")
    .eq("user_id", userId);

  if (roleErr) {
    logger.error(`resolveAdminContext: role lookup failed: ${roleErr.message}`);
    throw new AdminUnauthenticatedError("Could not verify admin roles");
  }

  const roles = (roleRows ?? []).map((r) => r.role_key as AdminRoleKey);
  const permissions = await resolvePermissions(serviceClient, roles);

  return {
    userId,
    email: opts?.email ?? null,
    roles,
    permissions,
    reauthenticatedAt: opts?.reauthenticatedAt ?? null,
  };
}

// Effective permissions come from the admin_role_permission TABLE (the
// runtime-editable matrix — see Admin › Settings), not the code constant.
// Safety net: if the table read fails, or a role somehow has zero rows,
// fall back to the compiled ROLE_PERMISSIONS so a bad matrix edit can't
// lock a valid admin out. super_admin is always granted every known
// permission regardless of table state (the DB also makes its rows
// immutable — migration 20260907091600).
const KNOWN_PERMISSIONS = new Set<string>(ADMIN_PERMISSION_KEYS);

async function resolvePermissions(
  serviceClient: SupabaseClient,
  roles: AdminRoleKey[],
): Promise<AdminPermissionKey[]> {
  if (roles.length === 0) return [];
  const isSuper = roles.includes("super_admin");
  const perms = new Set<AdminPermissionKey>();

  const { data, error } = await serviceClient
    .from("admin_role_permission")
    .select("role_key, permission_key")
    .in("role_key", roles);

  if (error) {
    logger.error(
      `resolveAdminContext: role-permission read failed, using code fallback: ${error.message}`,
    );
    for (const p of effectivePermissions(roles)) perms.add(p);
  } else {
    const byRole = new Map<string, AdminPermissionKey[]>();
    for (const r of data ?? []) {
      const k = r.permission_key as AdminPermissionKey;
      if (!KNOWN_PERMISSIONS.has(k)) continue;
      const arr = byRole.get(r.role_key) ?? [];
      arr.push(k);
      byRole.set(r.role_key, arr);
    }
    for (const role of roles) {
      const rows = byRole.get(role);
      // A role with zero rows is almost certainly a bad edit — fall back to
      // its compiled defaults rather than silently stripping the admin.
      const list =
        rows && rows.length > 0 ? rows : effectivePermissions([role]);
      for (const p of list) perms.add(p);
    }
  }

  if (isSuper) for (const p of ADMIN_PERMISSION_KEYS) perms.add(p);
  return [...perms];
}

export function assertPermission(
  ctx: AdminContext,
  required: AdminPermissionKey,
): void {
  if (!ctx.permissions.includes(required)) {
    throw new AdminForbiddenError(required);
  }
}

export function hasPermission(
  ctx: AdminContext,
  required: AdminPermissionKey,
): boolean {
  return ctx.permissions.includes(required);
}

// ─────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────

export type AuditInput = {
  actorId: string;
  actorRoles: string[];
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary?: string | null;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestMeta?: Record<string, unknown> | null;
};

// Single sink for the append-only admin_audit_log. Called inside every
// mutating admin service AFTER the mutation succeeds. A failure to write
// the audit row is logged loudly but does not roll back the action — the
// action already happened; losing the audit line is the lesser evil to
// surface rather than hide. (The DB also forbids UPDATE/DELETE on this
// table, so history can't be rewritten once written.)
export async function recordAdminAudit(
  serviceClient: SupabaseClient,
  input: AuditInput,
): Promise<void> {
  const { error } = await serviceClient.from("admin_audit_log").insert({
    actor_id: input.actorId,
    actor_roles: input.actorRoles,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    summary: input.summary ?? null,
    reason: input.reason ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    request_meta: input.requestMeta ?? null,
  });
  if (error) {
    logger.error(
      `AUDIT WRITE FAILED for action="${input.action}" target=${input.targetType}:${input.targetId} by ${input.actorId}: ${error.message}`,
    );
  }
}

export type AdminEnvelope<T = undefined> = {
  status: number;
  message?: string;
  data?: T;
};

// Maps a thrown AdminForbiddenError / AdminUnauthenticatedError (or
// anything else) to the standard { status, message } envelope so admin
// services can `try { ... } catch (e) { return adminError(e) }`.
export function adminError(err: unknown): AdminEnvelope {
  if (
    err instanceof AdminUnauthenticatedError ||
    err instanceof AdminForbiddenError
  ) {
    return { status: err.status, message: err.message };
  }
  logger.error("Unhandled admin service error", err);
  return { status: 500, message: "Something went wrong" };
}
