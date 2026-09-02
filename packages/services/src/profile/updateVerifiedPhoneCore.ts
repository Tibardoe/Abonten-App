import { logger } from "@abonten/core/logger";
import { HUBTEL_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { OTP_MESSAGES } from "@abonten/core/otpMessages";
import { verifyHubtelOtp } from "@abonten/services/profile/hubtelOtpClient";
import {
  clearPendingOtp,
  getPendingOtp,
  registerVerifyAttempt,
} from "@abonten/services/profile/phoneOtpStore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

export type UpdateVerifiedPhoneResult =
  | { status: 200; message: string }
  | { status: 400 | 401 | 409 | 429 | 500; message: string };

// Post-auth body of updateVerifiedPhone.ts, lifted so the mobile
// /api/mobile/account/phone/verify route runs the identical logic. The only
// thing removed is the createClient()+getUser() cookie check — the caller
// (the Server Action, or the Bearer-authed mobile route) has already
// established `userId`. Everything below (Hubtel confirm, attempt cap,
// admin.updateUserById) is verbatim. NOT a "use server" file.
export async function updateVerifiedPhoneCore(
  userId: string,
  phoneE164: string,
  code: string,
): Promise<UpdateVerifiedPhoneResult> {
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
    userId,
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
