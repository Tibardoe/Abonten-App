import { logger } from "@abonten/core/logger";
import { submitChargeOtp } from "@abonten/services/payments/gateway/paystackService";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of submitPaystackChargeOtp — shared with
// `/api/mobile/payments/charge-otp`. Ownership-checked against the
// payment_attempt the OTP is for, same as verifyPaystackPaymentCore.

export type SubmitChargeOtpCoreResult =
  | { status: 400 | 403 | 404 | 500; message: string }
  | { status: 200; data: { chargeStatus: string } };

export async function submitPaystackChargeOtpCore(
  supabase: SupabaseClient,
  userId: string,
  paymentAttemptId: string,
  otp: string,
): Promise<SubmitChargeOtpCoreResult> {
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

  if (attempt.user_id !== userId) {
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
