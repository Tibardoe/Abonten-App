import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveProviderAccount } from "./providers/registry";

// Post-auth body of submitChargeOtp — shared with
// `/api/mobile/payments/charge-otp`. Ownership-checked against the
// payment_attempt the OTP is for, same as verifyPaymentCore. The OTP goes
// to the provider account that started the charge.

export type SubmitChargeOtpCoreResult =
  | { status: 400 | 403 | 404 | 500; message: string }
  | { status: 200; data: { chargeStatus: string } };

export async function submitChargeOtpCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  paymentAttemptId: string,
  otp: string,
): Promise<SubmitChargeOtpCoreResult> {
  const { data: attempt, error: attemptError } = await supabase
    .from("payment_attempt")
    .select("id, user_id, provider, provider_reference, currency, country_code")
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
    const { provider, account } = await resolveProviderAccount({
      countryCode: attempt.country_code,
      currency: attempt.currency,
      providerCode: attempt.provider,
    });
    const result = await provider.submitOtp(
      account,
      attempt.provider_reference,
      otp,
    );
    return {
      status: 200,
      data: {
        chargeStatus:
          result.mode === "direct" ? result.chargeStatus : "pending",
      },
    };
  } catch (error) {
    logger.error(`Failed submitting charge OTP: ${error}`);
    return {
      status: 400,
      message: "That code didn't work. Please check and try again.",
    };
  }
}
