"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

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

  const { data: method, error: fetchError } = await supabase
    .from("payment_method")
    .select("id, is_default")
    .eq("id", paymentMethodId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (fetchError) {
    logger.error(`Failed fetching payment method: ${fetchError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!method) {
    return { status: 404, message: "Payment method not found" };
  }

  const { error: removeError } = await supabase
    .from("payment_method")
    .update({ status: "removed", is_default: false, updated_at: new Date() })
    .eq("id", paymentMethodId)
    .eq("user_id", user.id);

  if (removeError) {
    logger.error(`Failed removing payment method: ${removeError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (method.is_default) {
    const { data: nextDefault } = await supabase
      .from("payment_method")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nextDefault) {
      await supabase
        .from("payment_method")
        .update({ is_default: true, updated_at: new Date() })
        .eq("id", nextDefault.id)
        .eq("user_id", user.id);
    }
  }

  return { status: 200, message: "Payment method removed" };
}
