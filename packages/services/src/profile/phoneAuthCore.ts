import { logger } from "@abonten/core/logger";
import { otpMessage } from "@abonten/core/otpMessages";
import { verifyPendingOtp } from "@abonten/services/profile/phoneOtpSendCore";
import {
  clearPendingOtp,
  getPendingOtp,
  registerVerifyAttempt,
} from "@abonten/services/profile/phoneOtpStore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { coreT, tr } from "../i18n/requestLocale";
import { adoptHomeCountryFromPhone } from "../markets/localePreferencesCore";
import { deriveSigningKey, hmacBase64Url } from "../security/signing";

// Transport-neutral core of phone sign-in verification, shared by the web
// Server Action (src/actions/verifyPhoneSignIn.ts, cookie session) and the
// mobile HTTP route (src/app/api/mobile/auth/phone/verify, token body).
//
// Everything here is identical regardless of caller: confirm the code with the provider that sent it,
// then find-or-create the Supabase user for the phone number, then sign in
// with the account's server-only password (signInVerifiedPhoneUser). The two
// callers differ ONLY in how they turn that password into a live session
// (SSR cookie client vs plain supabase-js returning the tokens) and in when
// they fire the new-user profile-completion notification — both kept exactly
// as they were before this extraction.

export type ResolvePhoneUserResult =
  | { ok: true; userId: string; isNewUser: boolean }
  | { ok: false; status: 400 | 401 | 429 | 500; message: string };

export type FindOrCreateResult =
  | { userId: string; isNewUser: true }
  | { userId: string; isNewUser: false }
  | { error: string };

/**
 * Steps 1–7 of phone verification: format check, pending-OTP lookup, attempt
 * budget, provider verify, consume the pending code, resolve the user. It
 * never trusts anything the client claims about the phone belonging to a new
 * or existing account — that's decided here, server-side, against
 * auth.users itself.
 */
export async function verifyPhoneOtpAndResolveUser(
  phoneE164: string,
  code: string,
): Promise<ResolvePhoneUserResult> {
  if (!/^\d{4,8}$/.test(code)) {
    return {
      ok: false,
      status: 400,
      message: otpMessage(coreT(), "invalidFormat"),
    };
  }

  if (!(await getPendingOtp("sign-in", phoneE164))) {
    return { ok: false, status: 401, message: otpMessage(coreT(), "expired") };
  }

  const attemptAllowed = await registerVerifyAttempt("sign-in", phoneE164);

  if (!attemptAllowed) {
    return {
      ok: false,
      status: 429,
      message: otpMessage(coreT(), "tooManyAttempts"),
    };
  }

  const pending = await getPendingOtp("sign-in", phoneE164);

  if (!pending) {
    return { ok: false, status: 401, message: otpMessage(coreT(), "expired") };
  }

  const verifyResult = await verifyPendingOtp(pending, code);

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
      message: tr("somethingWentWrongSigningYouIn"),
    };
  }

  return { ok: true, userId: found.userId, isNewUser: found.isNewUser };
}

/**
 * Find-or-create the auth.users row for a verified phone. Exported for the
 * Field Ops owner flow (fieldOps/member/ownerOtpCore), which confirms the
 * business owner's code the same way but never mints a session.
 */
export async function findOrCreateUserByPhone(
  phoneE164: string,
): Promise<FindOrCreateResult> {
  const service = getSupabaseServiceClient();

  const { data: createData, error: createError } =
    await service.auth.admin.createUser({
      phone: phoneE164,
      phone_confirm: true,
    });

  if (!createError && createData.user) {
    // A brand-new account starts in the market of its verified number.
    await adoptHomeCountryFromPhone(createData.user.id, phoneE164);
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
 * The password phone sign-in uses for this account: derived from a server
 * secret (the service-role key, through `deriveSigningKey`), never sent to
 * a device, never shown to anyone. A holder of the service-role key could
 * sign in as anyone anyway, so it adds no new secret to protect.
 */
export function phoneSignInPassword(userId: string): string {
  return hmacBase64Url(deriveSigningKey("phone-sign-in-password"), userId);
}

type SignInAttempt = { error: { code?: string; message: string } | null };

function isWrongPassword(error: { code?: string; message: string }): boolean {
  return (
    error.code === "invalid_credentials" ||
    /invalid login credentials/i.test(error.message)
  );
}

/**
 * Turns a phone the provider has just confirmed into a session. Supabase has
 * no "mint a session for this user id" admin endpoint (generateLink is
 * email-only), so the session comes from Supabase's own token endpoint
 * through a password only the server knows: `attempt` signs in with it (the
 * web through its cookie client, the app's API on a session-less client).
 *
 * Setting a password through the Admin API ends every session the account
 * has (confirmed live). It used to be set to a new random value on every
 * phone sign-in, so signing in on the website or a second phone signed the
 * person out of the app everywhere else. Now the password is the same every
 * time and is only set when signing in with it fails — the account's first
 * phone sign-in under this rule, or after the service-role key changed —
 * which ends the other sessions that one time only.
 */
export async function signInVerifiedPhoneUser<R extends SignInAttempt>(
  userId: string,
  attempt: (password: string) => Promise<R>,
): Promise<{ ok: true; result: R } | { ok: false; message: string }> {
  const password = phoneSignInPassword(userId);

  const first = await attempt(password);
  if (!first.error) return { ok: true, result: first };
  if (!isWrongPassword(first.error)) {
    return { ok: false, message: first.error.message };
  }

  const service = getSupabaseServiceClient();
  const { error } = await service.auth.admin.updateUserById(userId, {
    password,
  });
  if (error) return { ok: false, message: error.message };

  const second = await attempt(password);
  if (second.error) return { ok: false, message: second.error.message };
  return { ok: true, result: second };
}
