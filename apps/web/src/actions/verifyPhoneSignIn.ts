"use server";

import ensureProfileCompletionNotification from "@/actions/ensureProfileCompletionNotification";
import { createClient } from "@/config/supabase/server";
import { getUserLocale } from "@/i18n/locale";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import { saveUserLocale } from "@abonten/services/i18n/userLocale";
import {
  issueOneTimePassword,
  verifyPhoneOtpAndResolveUser,
} from "@abonten/services/profile/phoneAuthCore";

export type VerifyPhoneSignInResult =
  | { status: 200 }
  | { status: 400 | 401 | 429 | 500; message: string };

// After Hubtel confirms the phone truly is the caller's, this is the only
// place a real Supabase session gets minted for phone auth on the web. The
// OTP verification + find-or-create + one-time-password steps now live in
// src/services/phoneAuthCore.ts so the mobile HTTP route runs them
// identically; this action only adds the web-specific piece — consuming the
// one-time password through the SSR cookie-writing client so real auth
// cookies get set on the response, exactly like exchangeCodeForSession does
// for Google.
export default withActionLocale(async function verifyPhoneSignIn(
  phoneE164: string,
  code: string,
): Promise<VerifyPhoneSignInResult> {
  const resolved = await verifyPhoneOtpAndResolveUser(phoneE164, code);

  if (!resolved.ok) {
    return { status: resolved.status, message: resolved.message };
  }

  const sessionResult = await mintSessionForUser(phoneE164, resolved.userId);

  if (!sessionResult.ok) {
    logger.error(
      `verifyPhoneSignIn: session mint failed: ${sessionResult.message}`,
    );
    return {
      status: 500,
      message: tr("somethingWentWrongSigningYouIn"),
    };
  }

  // The language they signed in with, before anything is written for them.
  await saveUserLocale(resolved.userId, await getUserLocale(), {
    onlyIfUnset: true,
  });

  if (resolved.isNewUser) {
    await ensureProfileCompletionNotification(resolved.userId);
  }

  return { status: 200 };
});

async function mintSessionForUser(
  phoneE164: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const password = await issueOneTimePassword(userId);

  if (!password.ok) {
    return { ok: false, message: password.message };
  }

  const supabase = await createClient();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    phone: phoneE164,
    password: password.secret,
  });

  if (signInError) {
    return { ok: false, message: signInError.message };
  }

  return { ok: true };
}
