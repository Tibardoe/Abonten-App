import {
  AdminForbiddenError,
  AdminUnauthenticatedError,
  STEP_UP_MAX_AGE_MS,
} from "@abonten/core/adminPermissions";
import { resolveAdminContext } from "@abonten/services/admin/adminContext";
import type {
  AdminContext,
  AdminPermissionKey,
} from "@abonten/types/adminTypes";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { tagAdminRequest } from "./sentry";
import { getServiceClient } from "./serviceClient";
import { createSsrClient } from "./supabaseServer";

const STEP_UP_COOKIE = "admin_stepup_at";

function emailAllowlist(): string[] {
  return (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The admin console's authorization boundary. Every console page and every
 * server action calls this first.
 *
 *   1. cookie session -> a signed-in Supabase user, else redirect to sign-in
 *   2. email allowlist -> not on it: "no access" (console existence hidden)
 *   3. resolveAdminContext() -> active admin_user + roles from the DB, every
 *      request. A disabled admin, or one whose roles changed, is reflected
 *      immediately.
 *
 * `redirectOnFail` (default true) is for page loads; server actions pass
 * false and handle the thrown error into an envelope.
 */
export async function requireAdmin(opts?: {
  redirectOnFail?: boolean;
}): Promise<AdminContext> {
  const redirectOnFail = opts?.redirectOnFail ?? true;

  const ssr = await createSsrClient();
  const {
    data: { user },
  } = await ssr.auth.getUser();

  if (!user) {
    if (redirectOnFail) redirect("/auth/signin");
    throw new AdminUnauthenticatedError();
  }

  const allow = emailAllowlist();
  const email = (user.email ?? "").toLowerCase();
  if (allow.length > 0 && !allow.includes(email)) {
    if (redirectOnFail) redirect("/no-access");
    throw new AdminUnauthenticatedError("No access");
  }

  const cookieStore = await cookies();
  const stepUpRaw = cookieStore.get(STEP_UP_COOKIE)?.value;
  const reauthenticatedAt = stepUpRaw ? Number.parseInt(stepUpRaw, 10) : null;

  try {
    const ctx = await resolveAdminContext(getServiceClient(), user.id, {
      email: user.email ?? null,
      reauthenticatedAt: Number.isFinite(reauthenticatedAt)
        ? reauthenticatedAt
        : null,
    });
    // Attach the admin's id + role keys to this request's Sentry scope
    // (request-isolated in @sentry/nextjs) — no email / other PII.
    tagAdminRequest(ctx);
    return ctx;
  } catch (err) {
    if (redirectOnFail) redirect("/no-access");
    throw err;
  }
}

/** Guard a page on a specific permission; renders nothing / redirects otherwise. */
export async function requirePermissionPage(
  permission: AdminPermissionKey,
): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (!ctx.permissions.includes(permission)) redirect("/no-access");
  return ctx;
}

/** For sensitive server actions: throws unless a step-up re-auth is fresh. */
export function assertStepUpFresh(ctx: AdminContext): void {
  if (
    !ctx.reauthenticatedAt ||
    Date.now() - ctx.reauthenticatedAt > STEP_UP_MAX_AGE_MS
  ) {
    throw new AdminForbiddenError(
      undefined,
      "This action needs a fresh re-authentication. Confirm your identity and try again.",
    );
  }
}

export async function currentRequestMeta(): Promise<Record<string, unknown>> {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ua: h.get("user-agent") ?? null,
    path: h.get("x-invoke-path") ?? h.get("referer") ?? null,
  };
}

export const STEP_UP_COOKIE_NAME = STEP_UP_COOKIE;
