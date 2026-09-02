"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UpdateVerifiedPhoneResult,
  updateVerifiedPhoneCore,
} from "@abonten/services/profile/updateVerifiedPhoneCore";

export type { UpdateVerifiedPhoneResult };

// Settings -> Security's add/change-phone flow, for an already-authenticated
// user. Unlike verifyPhoneSignIn.ts, no session needs to be minted -- the
// caller already has one -- so after Hubtel confirms the code this just
// attaches the verified number to the current user via the Admin API. The
// number is never marked verified before Hubtel actually confirms it.
//
// Thin wrapper: auth, then delegate to updateVerifiedPhoneCore (also used by
// the mobile /api/mobile/account/phone/verify route).
export default async function updateVerifiedPhone(
  phoneE164: string,
  code: string,
): Promise<UpdateVerifiedPhoneResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { status: 401, message: "You need to be signed in to do that." };
  }

  return updateVerifiedPhoneCore(userData.user.id, phoneE164, code);
}
