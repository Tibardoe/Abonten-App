"use server";

import { createClient } from "@/config/supabase/server";
import { removePaymentMethodCore } from "@/utils/paymentMethodCore";

/**
 * Soft-deletes a payment method (status -> 'removed') rather than a hard
 * delete, so any historical transaction/payment_attempt row that references
 * it keeps working. If the removed method was the user's default, the most
 * recently added remaining active method is promoted to default so the user
 * is never left with zero defaults while other methods still exist.
 */
export default async function removePaymentMethod(paymentMethodId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return removePaymentMethodCore(supabase, user.id, paymentMethodId);
}
