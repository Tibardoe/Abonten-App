"use server";

import { createClient } from "@/config/supabase/server";
import {
  type VerifyPaystackPaymentCoreResult,
  verifyPaystackPaymentCore,
} from "@/utils/verifyPaystackPaymentCore";

/**
 * Optimistic, client-triggered verification step, called right after the
 * Paystack popup reports success — this is a fast path for UI feedback
 * only, never the sole source of truth. It calls the exact same
 * finalizePaystackPayment() the webhook calls, so whichever of the two
 * "wins" the race does the real work, and the other is a no-op.
 */
export default async function verifyPaystackPayment(
  paymentAttemptId: string,
): Promise<VerifyPaystackPaymentCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return verifyPaystackPaymentCore(supabase, user.id, paymentAttemptId);
}
