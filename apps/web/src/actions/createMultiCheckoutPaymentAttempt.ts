"use server";

import { createClient } from "@/config/supabase/server";
import {
  type CreateMultiCheckoutPaymentAttemptCoreResult,
  createMultiCheckoutPaymentAttemptCore,
} from "@abonten/services/payments/createMultiCheckoutPaymentAttemptCore";

type CreateMultiCheckoutPaymentAttemptInput = {
  checkoutSessionIds: string[];
  paymentMethodId: string;
};

/**
 * Pays for several pending checkout sessions (possibly across different
 * events) in one action. For each session it creates one payment_attempt
 * row (never merging them), all tagged with the same paymentGroupId. It does
 * NOT complete the purchase — the Paystack popup/direct charge does that,
 * and finalizePaystackPayment.ts fans a successful verification back out to
 * the whole group.
 *
 * Always re-validates against the database (never the client) right before
 * writing anything.
 */
export default async function createMultiCheckoutPaymentAttempt(
  input: CreateMultiCheckoutPaymentAttemptInput,
): Promise<
  CreateMultiCheckoutPaymentAttemptCoreResult | { status: 401; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return createMultiCheckoutPaymentAttemptCore(
    supabase,
    user.id,
    user.email,
    input,
    (checkoutSessionId) =>
      `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/${checkoutSessionId}?type=ticket`,
  );
}
