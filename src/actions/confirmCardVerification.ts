"use server";

import addPaymentMethod from "@/actions/addPaymentMethod";
import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
import { createClient } from "@/config/supabase/server";
import {
  refundTransaction,
  verifyTransaction,
} from "@/services/paystackService";
import { logger } from "@/utils/logger";

type ConfirmCardVerificationResult =
  | { status: 400 | 401 | 500; message: string }
  | { status: 200; data: PaymentMethodRow };

/**
 * Completes the card-save flow after the Paystack popup reports success for
 * a card verification charge (initCardVerification.ts): independently
 * verifies the charge with Paystack (never trusts the popup callback
 * alone), confirms it belongs to the current user (the verified charge's
 * customer email must match — a reference alone isn't proof of ownership),
 * requires a reusable authorization, refunds the GHS 1 (best-effort — a
 * refund failure doesn't block saving the card, since the authorization is
 * already safely captured), then saves only the non-sensitive display
 * fields + the authorization token — never a card number or CVV.
 */
export default async function confirmCardVerification(
  reference: string,
  label?: string,
): Promise<ConfirmCardVerificationResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { status: 401, message: "User not logged in" };
  }

  let verification: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    verification = await verifyTransaction(reference);
  } catch (error) {
    logger.error(`Failed verifying card verification charge: ${error}`);
    return {
      status: 500,
      message: "Couldn't verify your card. Please try again.",
    };
  }

  if (verification.customer.email !== user.email) {
    logger.error(
      "confirmCardVerification: verified charge belongs to a different customer email",
    );
    return { status: 401, message: "Not authorized" };
  }

  if (verification.status !== "success") {
    return {
      status: 400,
      message: "Your card could not be verified. Please try again.",
    };
  }

  const authorization = verification.authorization;

  if (!authorization || !authorization.reusable) {
    return {
      status: 400,
      message:
        "This card can't be saved for future payments. Please try a different card.",
    };
  }

  try {
    await refundTransaction(reference);
  } catch (error) {
    // Best-effort only — the authorization is already captured and safe to
    // save regardless of whether the refund succeeds. Logged for manual
    // follow-up rather than blocking the user.
    logger.error(
      `Card verification refund failed for reference ${reference}: ${error}`,
    );
  }

  return addPaymentMethod({
    type: "card",
    brand: authorization.card_type,
    last4: authorization.last4,
    expiryMonth: Number(authorization.exp_month),
    expiryYear: Number(authorization.exp_year),
    authorizationCode: authorization.authorization_code,
    bank: authorization.bank,
    label,
  });
}
