"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/config/supabase/server";
import { initializeTransaction } from "@/services/paystackService";
import { logger } from "@/utils/logger";
import { toPesewas } from "@/utils/paystackAmount";

const CARD_VERIFICATION_AMOUNT_GHS = 1;

type InitCardVerificationResult =
  | { status: 401 | 500; message: string }
  | {
      status: 200;
      data: { reference: string; accessCode: string };
    };

/**
 * Starts a real GHS 1 Paystack charge purely to capture a reusable card
 * authorization — Paystack has no way to "tokenize" a card without an
 * actual charge. confirmCardVerification.ts refunds this amount immediately
 * after the authorization is captured. Restricted to the card channel only
 * (this flow exists specifically to save a card, not to take any payment).
 */
export default async function initCardVerification(): Promise<InitCardVerificationResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { status: 401, message: "User not logged in" };
  }

  const reference = `PSKCARD-${randomUUID()}`;

  try {
    const initialized = await initializeTransaction({
      email: user.email,
      amountInPesewas: toPesewas(CARD_VERIFICATION_AMOUNT_GHS),
      currency: "GHS",
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/wallet`,
      channels: ["card"],
      metadata: { purpose: "card_verification", userId: user.id },
    });

    return {
      status: 200,
      data: {
        reference: initialized.reference,
        accessCode: initialized.access_code,
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
