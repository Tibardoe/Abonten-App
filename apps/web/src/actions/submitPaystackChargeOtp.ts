"use server";

import { createClient } from "@/config/supabase/server";
import { submitChargeOtp } from "@/services/paystackService";
import { logger } from "@abonten/core/logger";

type SubmitPaystackChargeOtpResult =
  | { status: 400 | 401 | 403 | 404 | 500; message: string }
  | { status: 200; data: { chargeStatus: string } };

/**
 * Submits an OTP for a pending direct charge (mobile money/card charges
 * that returned Paystack's "send_otp" status) — a handful of Ghana mobile
 * money charges still require this in addition to the phone-prompt
 * approval. Ownership-checked against the payment_attempt the OTP is for,
 * same as verifyPaystackPayment.ts, so a user can only act on their own
 * in-flight payment.
 */
export default async function submitPaystackChargeOtp(
  paymentAttemptId: string,
  otp: string,
): Promise<SubmitPaystackChargeOtpResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("payment_attempt")
    .select("id, user_id, provider_reference")
    .eq("id", paymentAttemptId)
    .maybeSingle();

  if (attemptError) {
    logger.error(`Failed fetching payment attempt: ${attemptError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!attempt) {
    return { status: 404, message: "Payment attempt not found" };
  }

  if (attempt.user_id !== user.id) {
    return { status: 403, message: "Not authorized" };
  }

  if (!attempt.provider_reference) {
    return { status: 400, message: "This payment was never started" };
  }

  try {
    const result = await submitChargeOtp(otp, attempt.provider_reference);
    return { status: 200, data: { chargeStatus: result.status } };
  } catch (error) {
    logger.error(`Failed submitting charge OTP: ${error}`);
    return {
      status: 400,
      message: "That code didn't work. Please check and try again.",
    };
  }
}
