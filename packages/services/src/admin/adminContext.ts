import {
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
  const permissions = effectivePermissions(roles);

  return {
    userId,
    email: opts?.email ?? null,
    roles,
    permissions,
    reauthenticatedAt: opts?.reauthenticatedAt ?? null,
  };
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
