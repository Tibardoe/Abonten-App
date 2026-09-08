"use server";

import ensureProfileCompletionNotification from "@/actions/ensureProfileCompletionNotification";
import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { verifyEmailOtpCore } from "@abonten/services/profile/emailAuthCore";

export type VerifyEmailSignInResult =
  | { status: 200 }
  | { status: 400 | 401 | 429 | 500; message: string };

// Consumes the 6-digit email code and, on success, establishes the session.
// verifyOtp runs on the SSR cookie-writing client so real auth cookies land
// on the response — exactly like exchangeCodeForSession does for Google and
// signInWithPassword does for phone. Supabase owns the code lifecycle
// (single-use, expiry, per-IP verification cap); this only maps the result
// and fires the idempotent profile-completion nudge.
export default async function verifyEmailSignIn(
  email: string,
  token: string,
): Promise<VerifyEmailSignInResult> {
  const supabase = await createClient();

  const result = await verifyEmailOtpCore(supabase, { email, token });

  if (!result.ok) {
    return { status: result.status, message: result.message };
  }

  // Safe on every sign-in: the helper checks completion + existing state and
  // never duplicates. Covers both a brand-new email user and an existing
  // Google/phone user whose email identity just auto-linked.
  await ensureProfileCompletionNotification(result.userId).catch((error) => {
    // Never let a notification hiccup fail an otherwise-successful sign-in.
    logger.error("verifyEmailSignIn: profile-completion nudge failed", error);
  });

  return { status: 200 };
}
