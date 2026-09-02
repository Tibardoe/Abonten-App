import { randomUUID } from "node:crypto";
import { logger } from "@abonten/core/logger";
import { toPesewas } from "@abonten/core/paystackAmount";
import {
  initializeTransaction,
  refundTransaction,
  verifyTransaction,
} from "@abonten/services/payments/gateway/paystackService";
import {
  type AddPaymentMethodResult,
  addPaymentMethodCore,
} from "@abonten/services/payments/paymentMethodCore";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth bodies of initCardVerification / confirmCardVerification, lifted
// so the `/api/mobile/payment-methods/card/*` routes run the exact same
// flow as the web Server Actions. Paystack has no way to tokenise a card
// without a real charge, so this starts a GHS 1 `card`-channel charge,
// captures the reusable authorization from the verified result, refunds the
// GHS 1 (best-effort), and saves only the non-sensitive display fields +
// the authorization token — never a PAN/CVV. Deliberately NOT a "use server"
// file (see ticketInventory.ts).

const CARD_VERIFICATION_AMOUNT_GHS = 1;

export type InitCardVerificationCoreResult =
  | { status: 500; message: string }
  | {
      status: 200;
      data: { reference: string; accessCode: string; authorizationUrl: string };
    };

export async function initCardVerificationCore(
  userId: string,
  userEmail: string,
): Promise<InitCardVerificationCoreResult> {
  const reference = `PSKCARD-${randomUUID()}`;

  try {
    const initialized = await initializeTransaction({
      email: userEmail,
      amountInPesewas: toPesewas(CARD_VERIFICATION_AMOUNT_GHS),
      currency: "GHS",
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/wallet`,
      channels: ["card"],
      metadata: { purpose: "card_verification", userId },
    });

    return {
      status: 200,
      data: {
        reference: initialized.reference,
        accessCode: initialized.access_code,
        authorizationUrl: initialized.authorization_url,
      },
    };
  } catch (error) {
    logger.error(`Failed initializing card verification: ${error}`);
    return {
      status: 500,
      message: "Couldn't start card verification. Please try again.",
    };
  }
}

export type ConfirmCardVerificationCoreResult =
  | { status: 400 | 401 | 500; message: string }
  | AddPaymentMethodResult;

export async function confirmCardVerificationCore(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  reference: string,
  label?: string,
): Promise<ConfirmCardVerificationCoreResult> {
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

  // A reference alone isn't proof of ownership — the verified charge's
  // customer email must match the caller.
  if (verification.customer.email !== userEmail) {
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
    // save regardless of whether the refund succeeds.
    logger.error(
      `Card verification refund failed for reference ${reference}: ${error}`,
    );
  }

  return addPaymentMethodCore(supabase, userId, {
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
