"use server";

import { createClient } from "@/config/supabase/server";
import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import {
  type RetryPaymentFulfillmentCoreResult,
  retryPaymentFulfillmentCore,
} from "@abonten/services/payments/retryPaymentFulfillmentCore";

type RetryPaymentFulfillmentResult =
  | RetryPaymentFulfillmentCoreResult
  | { status: 401; message: string };

/**
 * User-facing recovery action for the "payment succeeded but fulfillment
 * failed" state (see finalizePaystackPayment.ts's "fulfillment_failed"
 * status). Never re-charges the user. Post-auth logic lives in
 * retryPaymentFulfillmentCore so the mobile API route shares it.
 */
export default async function retryPaymentFulfillment(
  paymentAttemptId: string,
): Promise<RetryPaymentFulfillmentResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return retryPaymentFulfillmentCore(
    supabase,
    user.id,
    paymentAttemptId,
    paymentFulfillmentDeps,
  );
}
