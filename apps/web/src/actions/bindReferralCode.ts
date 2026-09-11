"use server";

import { createClient } from "@/config/supabase/server";
import { isFinalBindResult } from "@abonten/core/rewards/invite";
import { bindReferralCodeCore } from "@abonten/services/rewards/inviteCore";
import {
  DEVICE_COOKIE_NAME,
  INVITE_FLAG_COOKIE_NAME,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
  inviteFromCookie,
  removeInvitesFromCookie,
} from "@abonten/services/rewards/referralCookie";
import { recordDeviceInstallCore } from "@abonten/services/rewards/referralCore";
import type { ReferralBindOutcome } from "@abonten/types/rewards";
import { cookies } from "next/headers";

/**
 * Joins the signed-in user to a friend's invite: the code they typed, or
 * (no code) the invite this browser holds from an /invite link. Once the
 * answer is final the browser forgets the invite, so it's only tried once.
 */
export async function bindReferralCode(input?: { code?: string }): Promise<{
  status: number;
  message?: string;
  data?: ReferralBindOutcome;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };

  const cookieStore = await cookies();
  const stored = inviteFromCookie(
    cookieStore.get(REFERRAL_COOKIE_NAME)?.value,
    Date.now(),
  );
  const typed = typeof input?.code === "string" ? input.code : null;

  if (!typed && !stored) {
    cookieStore.delete(INVITE_FLAG_COOKIE_NAME);
    return { status: 204 };
  }

  // The fraud checks compare devices: note this browser before binding.
  await recordDeviceInstallCore(
    cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null,
    user.id,
    "web",
  );

  const result = await bindReferralCodeCore(user.id, {
    code: typed ?? (stored?.code as string),
    source: typed ? "typed" : (stored?.source ?? "link"),
  });

  if (!typed && isFinalBindResult(result.data.result)) {
    const rest = removeInvitesFromCookie(
      cookieStore.get(REFERRAL_COOKIE_NAME)?.value,
    );
    if (rest) {
      cookieStore.set(REFERRAL_COOKIE_NAME, rest, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
      });
    } else {
      cookieStore.delete(REFERRAL_COOKIE_NAME);
    }
    cookieStore.delete(INVITE_FLAG_COOKIE_NAME);
  }

  return result;
}
