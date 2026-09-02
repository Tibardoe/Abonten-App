"use server";

import { createClient } from "@/config/supabase/server";
import {
  type SubmitChargeOtpCoreResult,
  submitPaystackChargeOtpCore,
} from "@abonten/services/payments/submitPaystackChargeOtpCore";

/**
 * Submits an OTP for a pending direct charge (mobile money/card charges
 * that returned Paystack's "send_otp" status). Ownership-checked against the
 * payment_attempt the OTP is for, same as verifyPaystackPayment.ts.
 */
export default async function submitPaystackChargeOtp(
  paymentAttemptId: string,
  otp: string,
): Promise<SubmitChargeOtpCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return submitPaystackChargeOtpCore(supabase, user.id, paymentAttemptId, otp);
}
