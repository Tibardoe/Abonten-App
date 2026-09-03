// The admin role -> permission matrix, framework-free. This MUST mirror the
// seed data in supabase/migrations/20260907090000_admin_rbac.sql. The DB is
// the enforcement authority (RPCs + service-layer checks read the tables);
// this copy exists so:
//   * the admin UI can hide/disable controls the user can't use, and
//   * @abonten/services/admin can do a fast in-memory permission check
//     after loading the caller's roles once.
//
// It is never the sole boundary — every mutating admin service re-derives
// the caller's roles from the DB via resolveAdminContext().

import type {
  AdminPermissionKey,
  AdminRoleKey,
} from "@abonten/types/adminTypes";

export const ADMIN_ROLE_KEYS: AdminRoleKey[] = [
  "super_admin",
  "operations",
  "moderator",
  "finance_admin",
  "support_admin",
  "analyst",
];

export const ADMIN_PERMISSION_KEYS: AdminPermissionKey[] = [
  "dashboard.view",
  "reports.view",
  "reports.assign",
  "reports.update_status",
  "reports.request_info",
  "reports.escalate",
  "reports.note",
  "reports.mark_false",
  "reports.resolve",
  "moderation.hide",
  "moderation.remove",
  "moderation.restore",
  "moderation.restrict",
  "users.view",
  "users.view_pii",
  "users.suspend",
  "users.ban",
  "users.restore",
  "organizers.view",
  "events.view",
  "places.view",
  "tickets.view",
  "transactions.view",
  "finance.view",
  "finance.refund",
  "finance.payout",
  "finance.adjust",
  "claims.view",
  "claims.review",
  "reviews.view",
  "notifications.view",
  "monitoring.view",
  "monitoring.manage",
  "incidents.manage",
  "analytics.view",
  "audit.view",
  "settings.view",
  "settings.manage",
  "admins.manage",
];

const MODERATOR: AdminPermissionKey[] = [
  "dashboard.view",
  "reports.view",
  "reports.assign",
  "reports.update_status",
  "reports.request_info",
  "reports.escalate",
  "reports.note",
  "reports.mark_false",
  "reports.resolve",
  "moderation.hide",
  "moderation.remove",
  "moderation.restore",
  "moderation.restrict",
  "users.view",
  "users.suspend",
  "organizers.view",
  "events.view",
  "places.view",
  "reviews.view",
  "monitoring.view",
];

const FINANCE_ADMIN: AdminPermissionKey[] = [
  "dashboard.view",
  "finance.view",
  "finance.refund",
  "finance.payout",
  "finance.adjust",
  "transactions.view",
  "tickets.view",
  "users.view",
  "organizers.view",
  "events.view",
  "reports.view",
  "reports.note",
  "analytics.view",
  "audit.view",
  "monitoring.view",
];

const SUPPORT_ADMIN: AdminPermissionKey[] = [
  "dashboard.view",
  "users.view",
  "users.view_pii",
  "tickets.view",
  "transactions.view",
  "events.view",
  "places.view",
  "organizers.view",
  "reports.view",
  "reports.note",
  "claims.view",
  "reviews.view",
  "monitoring.view",
];

const ANALYST: AdminPermissionKey[] = [
  "dashboard.view",
  "users.view",
  "organizers.view",
  "events.view",
  "places.view",
  "tickets.view",
  "transactions.view",
  "finance.view",
  "claims.view",
  "reviews.view",
  "reports.view",
  "notifications.view",
  "analytics.view",
  "monitoring.view",
  "audit.view",
];

// operations = everything except financial mutations / admin management /
// settings mutation.
const OPERATIONS_EXCLUDED = new Set<AdminPermissionKey>([
  "finance.refund",
  "finance.payout",
  "finance.adjust",
  "admins.manage",
  "settings.manage",
]);
const OPERATIONS: AdminPermissionKey[] = ADMIN_PERMISSION_KEYS.filter(
  (p) => !OPERATIONS_EXCLUDED.has(p),
);

export const ROLE_PERMISSIONS: Record<AdminRoleKey, AdminPermissionKey[]> = {
  super_admin: [...ADMIN_PERMISSION_KEYS],
  operations: OPERATIONS,
  moderator: MODERATOR,
  finance_admin: FINANCE_ADMIN,
  support_admin: SUPPORT_ADMIN,
  analyst: ANALYST,
};

export function effectivePermissions(
  roles: readonly AdminRoleKey[],
): AdminPermissionKey[] {
  const set = new Set<AdminPermissionKey>();
  for (const role of roles) {
    for (const perm of ROLE_PERMISSIONS[role] ?? []) set.add(perm);
  }
  return [...set];
}

export function can(
  permissions: readonly AdminPermissionKey[],
  required: AdminPermissionKey,
): boolean {
  return permissions.includes(required);
}

export function canAny(
  permissions: readonly AdminPermissionKey[],
  required: readonly AdminPermissionKey[],
): boolean {
  return required.some((r) => permissions.includes(r));
}

// Thrown by requirePermission(); transports map these to HTTP 401 / 403.
export class AdminUnauthenticatedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AdminUnauthenticatedError";
  }
}

export class AdminForbiddenError extends Error {
  readonly status = 403 as const;
  readonly requiredPermission?: AdminPermissionKey;
  constructor(requiredPermission?: AdminPermissionKey, message?: string) {
    super(message ?? "You do not have permission to perform this action");
    this.name = "AdminForbiddenError";
    this.requiredPermission = requiredPermission;
  }
}

export function requirePermission(
  permissions: readonly AdminPermissionKey[] | null | undefined,
  required: AdminPermissionKey,
): void {
  if (!permissions) throw new AdminUnauthenticatedError();
  if (!permissions.includes(required)) throw new AdminForbiddenError(required);
}

// Sensitive actions that must be behind a fresh step-up re-auth. The admin
// guard checks AdminContext.reauthenticatedAt against STEP_UP_MAX_AGE_MS.
export const STEP_UP_PERMISSIONS: AdminPermissionKey[] = [
  "users.ban",
  "finance.refund",
  "finance.payout",
  "finance.adjust",
  "admins.manage",
  "settings.manage",
];

export const STEP_UP_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
