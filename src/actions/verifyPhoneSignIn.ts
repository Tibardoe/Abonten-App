"use server";

import { randomBytes } from "node:crypto";
import ensureProfileCompletionNotification from "@/actions/ensureProfileCompletionNotification";
import { createClient } from "@/config/supabase/server";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { verifyHubtelOtp } from "@/services/hubtelOtpClient";
import {
  clearPendingOtp,
  getPendingOtp,
  registerVerifyAttempt,
} from "@/services/phoneOtpStore";
import { HUBTEL_OTP_CODE_LENGTH } from "@/utils/otpConstants";

export type VerifyPhoneSignInResult =
  | { status: 200 }
  | { status: 400 | 401 | 429 | 500; message: string };

type FindOrCreateResult =
  | { userId: string; isNewUser: true }
  | { userId: string; isNewUser: false }
  | { error: string };

// After Hubtel confirms the phone truly is the caller's, this is the only
// place a real Supabase session gets minted for phone auth. It never trusts
// anything the client claims about the phone belonging to a new or existing
// account (Part 2/35 of the brief) -- that's resolved here, server-side,
// against auth.users itself.
//
// Session-minting technique: since Supabase has no public "mint a session
// for this user id" admin endpoint (generateLink is email-only), a random
// one-time password is set via the Admin API and immediately consumed via
// signInWithPassword through the SSR cookie-writing client (so real auth
// cookies get set on the response, exactly like exchangeCodeForSession does
// for Google). The resulting session is issued by Supabase's own token
// endpoint -- not a forged token.
//
// Deliberately NOT rotated again after sign-in: confirmed live (see git
// history for the throwaway repro script) that changing a user's password
// via the Admin API revokes their existing sessions immediately -- so an
// extra rotate-right-after-sign-in step was silently invalidating the
// session on the same request that created it. The password is simply left
// as this random, never-transmitted-to-any-client value until the next
// phone sign-in overwrites it.
export default async function verifyPhoneSignIn(
  phoneE164: string,
  code: string,
): Promise<VerifyPhoneSignInResult> {
  if (!new RegExp(`^\\d{${HUBTEL_OTP_CODE_LENGTH}}$`).test(code)) {
    return { status: 400, message: "Enter the code we sent you." };
  }

  if (!(await getPendingOtp("sign-in", phoneE164))) {
    return {
      status: 401,
      message: "That code has expired. Please request a new one.",
    };
  }

  const attemptAllowed = await registerVerifyAttempt("sign-in", phoneE164);

  if (!attemptAllowed) {
    return {
      status: 429,
      message: "Too many incorrect attempts. Please request a new code.",
    };
  }

  const pending = await getPendingOtp("sign-in", phoneE164);

  if (!pending) {
    return {
      status: 401,
      message: "That code has expired. Please request a new one.",
    };
  }

  const verifyResult = await verifyHubtelOtp(
    pending.requestId,
    pending.prefix,
    code,
  );

  if (!verifyResult.ok) {
    return { status: 401, message: verifyResult.message };
  }

  await clearPendingOtp("sign-in", phoneE164);

  const found = await findOrCreateUserByPhone(phoneE164);

  if ("error" in found) {
    console.error(
      `verifyPhoneSignIn: findOrCreateUserByPhone failed: ${found.error}`,
    );
    return { status: 500, message: "Something went wrong signing you in." };
  }

  const sessionResult = await mintSessionForUser(phoneE164, found.userId);

  if (!sessionResult.ok) {
    console.error(
      `verifyPhoneSignIn: session mint failed: ${sessionResult.message}`,
    );
    return { status: 500, message: "Something went wrong signing you in." };
  }

  if (found.isNewUser) {
    await ensureProfileCompletionNotification(found.userId);
  }

  return { status: 200 };
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

async function mintSessionForUser(
  phoneE164: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const service = getSupabaseServiceClient();
  const oneTimeSecret = randomBytes(32).toString("hex");

  const { error: setPasswordError } = await service.auth.admin.updateUserById(
    userId,
    {
      password: oneTimeSecret,
    },
  );

  if (setPasswordError) {
    return { ok: false, message: setPasswordError.message };
  }

  const supabase = await createClient();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    phone: phoneE164,
    password: oneTimeSecret,
  });

  if (signInError) {
    return { ok: false, message: signInError.message };
  }

  return { ok: true };
}
