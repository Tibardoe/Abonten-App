"use server";

import { createClient } from "@/config/supabase/server";
import {
  type ConfirmCardVerificationCoreResult,
  confirmCardVerificationCore,
} from "@abonten/services/payments/cardVerificationCore";

/**
 * Completes the card-save flow after the Paystack popup reports success for
 * a card verification charge (initCardVerification.ts): independently
 * verifies the charge with Paystack (never trusts the popup callback
 * alone), confirms it belongs to the current user, requires a reusable
 * authorization, refunds the GHS 1 (best-effort), then saves only the
 * non-sensitive display fields + the authorization token. Post-auth logic
 * lives in cardVerificationCore so the mobile API route shares it.
 */
export default async function confirmCardVerification(
  reference: string,
  label?: string,
): Promise<
  ConfirmCardVerificationCoreResult | { status: 401; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { status: 401, message: "User not logged in" };
  }

  return confirmCardVerificationCore(
    supabase,
    user.id,
    user.email,
    reference,
    label,
  );
}
