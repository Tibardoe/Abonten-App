"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type SubmitChargeOtpCoreResult,
  submitChargeOtpCore,
} from "@abonten/services/payments/submitChargeOtpCore";

/**
 * Submits an OTP for a pending direct charge (mobile money/card charges
 * that returned Paystack's "send_otp" status). Ownership-checked against the
 * payment_attempt the OTP is for, same as verifyPaystackPayment.ts.
 */
export default withActionLocale(async function submitPaystackChargeOtp(
  paymentAttemptId: string,
  otp: string,
): Promise<SubmitChargeOtpCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  return submitChargeOtpCore(supabase, user.id, paymentAttemptId, otp);
});
