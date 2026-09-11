"use server";

import { createClient } from "@/config/supabase/server";
import { getReferralLinkCore } from "@abonten/services/rewards/referralCore";

/**
 * The signed-in user's referral code for share links (created on first
 * use), or no code while referral capture is off / signed out.
 */
export async function getReferralLink() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: 200,
      data: { captureEnabled: false, code: null, attributionWindowDays: 7 },
    };
  }

  return getReferralLinkCore(user.id);
}
