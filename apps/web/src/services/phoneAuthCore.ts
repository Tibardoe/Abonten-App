import { randomBytes } from "node:crypto";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { verifyHubtelOtp } from "@/services/hubtelOtpClient";
import {
  clearPendingOtp,
  getPendingOtp,
  registerVerifyAttempt,
} from "@/services/phoneOtpStore";
import { logger } from "@abonten/core/logger";
import { HUBTEL_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { OTP_MESSAGES } from "@abonten/core/otpMessages";

// Transport-neutral core of phone sign-in verification, shared by the web
// Server Action (src/actions/verifyPhoneSignIn.ts, cookie session) and the
// mobile HTTP route (src/app/api/mobile/auth/phone/verify, token body).
//
// Everything here is identical regardless of caller: confirm the Hubtel OTP,
// then find-or-create the Supabase user for the phone number, then hand back
// a one-time password the caller consumes with signInWithPassword. The two
// callers differ ONLY in how they turn that password into a live session
// (SSR cookie client vs plain supabase-js returning the tokens) and in when
// they fire the new-user profile-completion notification — both kept exactly
// as they were before this extraction.

export type ResolvePhoneUserResult =
  | { ok: true; userId: string; isNewUser: boolean }
  | { ok: false; status: 400 | 401 | 429 | 500; message: string };

type FindOrCreateResult =
  | { userId: string; isNewUser: true }
  | { userId: string; isNewUser: false }
  | { error: string };

/**
 * Steps 1–7 of phone verification: format check, pending-OTP lookup, attempt
 * budget, Hubtel verify, consume the pending code, resolve the user. It
 * never trusts anything the client claims about the phone belonging to a new
 * or existing account — that's decided here, server-side, against
 * auth.users itself.
 */
export async function verifyPhoneOtpAndResolveUser(
  phoneE164: string,
  code: string,
): Promise<ResolvePhoneUserResult> {
  if (!new RegExp(`^\\d{${HUBTEL_OTP_CODE_LENGTH}}$`).test(code)) {
    return { ok: false, status: 400, message: OTP_MESSAGES.invalidFormat };
  }

  if (!(await getPendingOtp("sign-in", phoneE164))) {
    return { ok: false, status: 401, message: OTP_MESSAGES.expired };
  }

  const attemptAllowed = await registerVerifyAttempt("sign-in", phoneE164);

  if (!attemptAllowed) {
    return { ok: false, status: 429, message: OTP_MESSAGES.tooManyAttempts };
  }

  const pending = await getPendingOtp("sign-in", phoneE164);

  if (!pending) {
    return { ok: false, status: 401, message: OTP_MESSAGES.expired };
  }

  const verifyResult = await verifyHubtelOtp(
    pending.requestId,
    pending.prefix,
    code,
  );

  if (!verifyResult.ok) {
    return { ok: false, status: 401, message: verifyResult.message };
  }

  await clearPendingOtp("sign-in", phoneE164);

  const found = await findOrCreateUserByPhone(phoneE164);

  if ("error" in found) {
    logger.error(
      `verifyPhoneOtpAndResolveUser: findOrCreateUserByPhone failed: ${found.error}`,
    );
    return {
      ok: false,
      status: 500,
      message: "Something went wrong signing you in.",
    };
  }

  return { ok: true, userId: found.userId, isNewUser: found.isNewUser };
}

async function findOrCreateUserByPhone(
  phoneE164: string,
): Promise<FindOrCreateResult> {
  const service = getSupabaseServiceClient();

  const { data: createData, error: createError } =
    await service.auth.admin.createUser({
      phone: phoneE164,
      phone_confirm: true,
    });

  if (!createError && createData.user) {
    return { userId: createData.user.id, isNewUser: true };
  }

  // Postgres's own unique constraint on auth.users.phone is what makes this
  // race-safe: if two verify calls for the same brand-new phone land at the
  // same time, only one createUser succeeds -- the other lands here and
  // looks the winner up instead of creating a duplicate account.
  const isConflict =
    !!createError &&
    (createError.status === 422 ||
      createError.status === 400 ||
      /already.*(registered|exists)/i.test(createError.message));

  if (!isConflict) {
    return { error: createError?.message ?? "Unknown error creating user" };
  }

  // Supabase's Auth server strips the leading "+" before storing
  // auth.users.phone (confirmed against the live table -- e.g. "+233..."
  // is persisted as "233..."). The Admin API calls above go through that
  // same normalization automatically either way, but this RPC does a raw
  // Postgres equality check, so it needs the number in the same
  // already-stored, plus-less form or it will never match.
  const { data: existingUserId, error: rpcError } = await service.rpc(
    "get_auth_user_id_by_phone",
    { p_phone: phoneE164.replace(/^\+/, "") },
  );

  if (rpcError || !existingUserId) {
    return {
      error: rpcError?.message ?? "Existing user not found after conflict",
    };
  }

  return { userId: existingUserId as string, isNewUser: false };
}

/**
 * Since Supabase has no public "mint a session for this user id" admin
 * endpoint (generateLink is email-only), the caller sets a random one-time
 * password via the Admin API and immediately consumes it via
 * signInWithPassword — so the resulting session is issued by Supabase's own
 * token endpoint, not a forged token.
 *
 * Deliberately NOT rotated again after sign-in: changing a user's password
 * via the Admin API revokes their existing sessions immediately (confirmed
 * live), so an extra rotate-right-after step silently invalidates the
 * session on the same request that created it. The password is simply left
 * as this random, never-transmitted value until the next phone sign-in
 * overwrites it.
 */
export async function issueOneTimePassword(
  userId: string,
): Promise<{ ok: true; secret: string } | { ok: false; message: string }> {
  const service = getSupabaseServiceClient();
  const secret = randomBytes(32).toString("hex");

  const { error } = await service.auth.admin.updateUserById(userId, {
    password: secret,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, secret };
}
