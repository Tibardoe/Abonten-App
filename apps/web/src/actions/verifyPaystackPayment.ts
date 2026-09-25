"use server";

import { createClient } from "@/config/supabase/server";
import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import {
  type VerifyPaymentCoreResult,
  verifyPaymentCore,
} from "@abonten/services/payments/verifyPaymentCore";

/**
 * Optimistic, client-triggered verification step, called right after the
 * Paystack popup reports success — this is a fast path for UI feedback
 * only, never the sole source of truth. It calls the exact same
 * finalizePayment() the webhook calls, so whichever of the two
 * "wins" the race does the real work, and the other is a no-op.
 */
export default async function verifyPaystackPayment(
  paymentAttemptId: string,
): Promise<VerifyPaymentCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return verifyPaymentCore(
    supabase,
    user.id,
    paymentAttemptId,
    paymentFulfillmentDeps,
  );
}
