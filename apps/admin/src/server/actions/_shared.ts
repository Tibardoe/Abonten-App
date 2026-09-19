// Helpers shared by every Server Action module under this folder. Plain
// module (no "use server"): only async functions may be exported from an
// action file, and these are the synchronous bits they all need.

import { captureAdminActionError } from "@/lib/sentry";
import { getServiceClient } from "@/lib/serviceClient";
import { adminError as toAdminEnvelope } from "@abonten/services/admin/adminContext";

export const svc = () => getServiceClient();

// Every action catches its throw and returns a { status, message }
// envelope, so Next's onRequestError never sees the failure. Forward the
// genuinely unexpected ones (not the guard's expected 401/403) to the
// `abonten-admin` Sentry project before mapping to the envelope.
export function adminError(e: unknown, action?: string) {
  captureAdminActionError(e, action);
  return toAdminEnvelope(e);
}

// ── Rewards (Abonten Credit) ────────────────────────────────
// Credit only moves through the credit_* database functions; these actions
// validate, re-check the admin (+ step-up for adjustments and settings) and
// delegate to @abonten/services/admin/rewards.

export function firstIssue(error: { issues: { message: string }[] }) {
  return { status: 400, message: error.issues[0]?.message ?? "Invalid input" };
}
