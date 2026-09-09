import { createHash } from "node:crypto";
import {
  EMAIL_OTP_CODE_LENGTH,
  EMAIL_OTP_MESSAGES,
  isLikelyEmail,
  normalizeEmail,
} from "@abonten/core/emailOtp";
import { logger } from "@abonten/core/logger";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Transport-neutral core of email one-time-code sign-in, shared by the web
// Server Actions (src/actions/requestEmailOtp.ts + verifyEmailSignIn.ts,
// cookie session) and the mobile POST /api/mobile/auth/email/request route.
//
// Unlike phone auth, there is NO custom provider and NO app-owned token
// store: Supabase Auth issues, hashes, expires and single-uses the 6-digit
// code itself (auth.email.otp_*), and enforces its own per-IP verification
// cap (auth.rate_limit.token_verifications). This module adds only:
//   * input validation,
//   * an app-level per-email + per-IP SEND cap on top of Supabase's, via
//     the shared consume_rate_limit primitive (fail-open), and
//   * enumeration-safe result mapping (never reveal whether an account
//     exists — see the task's FLOW 8/9 and §14).
//
// The caller passes an anon Supabase client for the send (no session
// needed) and, for verify, the client whose session should receive the
// tokens: the SSR cookie client on web, the native client on mobile.

type AnyClient = SupabaseClient<Database>;

// Per-email: at most 3 code emails in 15 minutes. Per-IP: at most 15 in an
// hour (coarse — an IP can legitimately be a shared NAT / office). Both are
// deliberately looser than Supabase's own caps so this layer only ever
// catches obvious bulk abuse, never a real user retrying.
const SEND_LIMIT_PER_EMAIL = 3;
const SEND_WINDOW_PER_EMAIL_SECONDS = 15 * 60;
const SEND_LIMIT_PER_IP = 15;
const SEND_WINDOW_PER_IP_SECONDS = 60 * 60;

// The rate-limit key must not contain a raw email address (it would end up
// in the rate_limit_bucket table). Hash it.
function emailKey(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 32);
}

export type RequestEmailOtpResult =
  | { status: 200 }
  | { status: 400 | 429 | 500; message: string };

export async function requestEmailOtpCore(
  supabase: AnyClient,
  input: { email: string; ip: string | null },
): Promise<RequestEmailOtpResult> {
  const email = normalizeEmail(input.email);

  if (!isLikelyEmail(email)) {
    return { status: 400, message: EMAIL_OTP_MESSAGES.invalidEmail };
  }

  const withinEmailCap = await checkRateLimit(
    `email-otp:send:${emailKey(email)}`,
    SEND_LIMIT_PER_EMAIL,
    SEND_WINDOW_PER_EMAIL_SECONDS,
  );

  if (!withinEmailCap) {
    return { status: 429, message: EMAIL_OTP_MESSAGES.rateLimited };
  }

  if (input.ip) {
    const withinIpCap = await checkRateLimit(
      `email-otp:send:ip:${input.ip}`,
      SEND_LIMIT_PER_IP,
      SEND_WINDOW_PER_IP_SECONDS,
    );

    if (!withinIpCap) {
      return { status: 429, message: EMAIL_OTP_MESSAGES.rateLimited };
    }
  }

  // No emailRedirectTo: this is a code-entry flow only. Omitting it means
  // the link Supabase still includes in the email defaults to the Site URL
  // (harmless) and we introduce no redirect-target surface of our own.
  // shouldCreateUser:true — a first-time email user is signed up here, same
  // as the phone flow; the on_auth_user_created trigger makes the profile.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (error) {
    // A 429 from Supabase's own rate limiter (built-in SMTP is ~2-4/hour;
    // custom SMTP much higher) — surface as a slow-down, not a failure.
    if (error.status === 429) {
      return { status: 429, message: EMAIL_OTP_MESSAGES.rateLimited };
    }

    // Anything else: log the real reason server-side, tell the user
    // nothing specific (could be "signups disabled", a provider outage,
    // etc. — none of which should hint at account state).
    logger.error(`requestEmailOtpCore: signInWithOtp failed: ${error.message}`);
    return { status: 500, message: EMAIL_OTP_MESSAGES.generic };
  }

  return { status: 200 };
}

export type VerifyEmailOtpResult =
  | { ok: true; userId: string }
  | { ok: false; status: 400 | 401 | 429 | 500; message: string };

export async function verifyEmailOtpCore(
  supabase: AnyClient,
  input: { email: string; token: string },
): Promise<VerifyEmailOtpResult> {
  const email = normalizeEmail(input.email);
  const token = input.token.trim();

  if (!new RegExp(`^\\d{${EMAIL_OTP_CODE_LENGTH}}$`).test(token)) {
    return {
      ok: false,
      status: 400,
      message: EMAIL_OTP_MESSAGES.invalidFormat,
    };
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    if (error?.status === 429) {
      return {
        ok: false,
        status: 429,
        message: EMAIL_OTP_MESSAGES.rateLimited,
      };
    }

    // Supabase returns the same 403 (`otp_expired`, "Token has expired or
    // is invalid") for a wrong code and an expired one, so there is nothing
    // to branch on — one message covers both. It never depends on whether
    // the email is registered.
    return {
      ok: false,
      status: 401,
      message: EMAIL_OTP_MESSAGES.invalidOrExpired,
    };
  }

  return { ok: true, userId: data.user.id };
}
