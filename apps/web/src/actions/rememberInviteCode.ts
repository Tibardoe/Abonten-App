"use server";

import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import {
  INVITE_FLAG_COOKIE_NAME,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
  addInviteToCookie,
} from "@abonten/services/rewards/referralCookie";
import { cookies } from "next/headers";

/**
 * An invite code typed on the sign-in screen, before the account exists.
 * Kept in the signed referral cookie (like an /invite link) and bound to the
 * account by InviteBinder once sign-in finishes -- whichever way they sign
 * in, Google's redirect included. Only checks the code's shape here; the
 * server decides everything when it binds.
 */
export async function rememberInviteCode(rawCode: string) {
  const code = normalizeReferralCode(
    typeof rawCode === "string" ? rawCode : null,
  );
  if (!code) {
    return { status: 400, message: "Enter the 7-character invite code." };
  }

  const cookieStore = await cookies();
  const next = addInviteToCookie(
    cookieStore.get(REFERRAL_COOKIE_NAME)?.value,
    code,
    Date.now(),
    "typed",
  );
  if (!next) {
    return { status: 400, message: "Enter the 7-character invite code." };
  }

  const options = {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
  };
  cookieStore.set(REFERRAL_COOKIE_NAME, next, { ...options, httpOnly: true });
  cookieStore.set(INVITE_FLAG_COOKIE_NAME, "1", {
    ...options,
    httpOnly: false,
  });
  return { status: 200, data: { code } };
}
