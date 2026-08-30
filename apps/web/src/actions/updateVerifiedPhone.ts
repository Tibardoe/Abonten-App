"use server";

import { createClient } from "@/config/supabase/server";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { verifyHubtelOtp } from "@/services/hubtelOtpClient";
import {
  clearPendingOtp,
  getPendingOtp,
  registerVerifyAttempt,
} from "@/services/phoneOtpStore";
import { logger } from "@/utils/logger";
import { HUBTEL_OTP_CODE_LENGTH } from "@/utils/otpConstants";
import { OTP_MESSAGES } from "@/utils/otpMessages";

export type UpdateVerifiedPhoneResult =
  | { status: 200; message: string }
  | { status: 400 | 401 | 409 | 429 | 500; message: string };

// Settings -> Security's add/change-phone flow, for an already-authenticated
// user. Unlike verifyPhoneSignIn.ts, no session needs to be minted -- the
// caller already has one -- so after Hubtel confirms the code this just
// attaches the verified number to the current user via the Admin API. The
// number is never marked verified before Hubtel actually confirms it.
export default async function updateVerifiedPhone(
  phoneE164: string,
  code: string,
): Promise<UpdateVerifiedPhoneResult> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { status: 401, message: "You need to be signed in to do that." };
  }

  if (!new RegExp(`^\\d{${HUBTEL_OTP_CODE_LENGTH}}$`).test(code)) {
    return { status: 400, message: OTP_MESSAGES.invalidFormat };
  }

  if (!(await getPendingOtp("phone-update", phoneE164))) {
    return { status: 401, message: OTP_MESSAGES.expired };
  }

  const attemptAllowed = await registerVerifyAttempt("phone-update", phoneE164);

  if (!attemptAllowed) {
    return { status: 429, message: OTP_MESSAGES.tooManyAttempts };
  }

  const pending = await getPendingOtp("phone-update", phoneE164);

  if (!pending) {
    return { status: 401, message: OTP_MESSAGES.expired };
  }

  const verifyResult = await verifyHubtelOtp(
    pending.requestId,
    pending.prefix,
    code,
  );

  if (!verifyResult.ok) {
    return { status: 401, message: verifyResult.message };
  }

  await clearPendingOtp("phone-update", phoneE164);

  const service = getSupabaseServiceClient();

  const { error: updateError } = await service.auth.admin.updateUserById(
    userData.user.id,
    {
      phone: phoneE164,
      phone_confirm: true,
    },
  );

  if (updateError) {
    // Don't confirm to the caller that the number belongs to someone else --
    // a generic message avoids account-enumeration (Part 23/35).
    const isConflict =
      updateError.status === 422 ||
      updateError.status === 400 ||
      /already.*(registered|exists)/i.test(updateError.message);

    if (isConflict) {
      return { status: 409, message: "That phone number can't be used." };
    }

    logger.error(`updateVerifiedPhone: update failed: ${updateError.message}`);
    return { status: 500, message: "Something went wrong. Please try again." };
  }

  return { status: 200, message: "Phone number updated successfully." };
}
