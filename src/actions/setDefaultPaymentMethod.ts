"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

/**
 * Marks one payment method as the user's default, unsetting any previous
 * default first. This is a deliberate two-step update rather than a single
 * transaction (the Supabase JS client issues each call as its own request) —
 * the database's partial unique index (one default per user) guarantees two
 * methods can never both end up default, and the accepted edge case is a
 * last-write-wins outcome if a user fires two "set default" clicks at once,
 * not a constraint violation or data corruption.
 */
export default async function setDefaultPaymentMethod(paymentMethodId: string) {
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
    .select("id")
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

  const { error: unsetError } = await supabase
    .from("payment_method")
    .update({ is_default: false, updated_at: new Date() })
    .eq("user_id", user.id)
    .eq("is_default", true)
    .neq("id", paymentMethodId);

  if (unsetError) {
    logger.error(`Failed clearing previous default: ${unsetError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: setError } = await supabase
    .from("payment_method")
    .update({ is_default: true, updated_at: new Date() })
    .eq("id", paymentMethodId)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (setError) {
    logger.error(`Failed setting default payment method: ${setError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Default payment method updated" };
}
