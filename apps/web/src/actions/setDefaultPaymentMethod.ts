"use server";

import { createClient } from "@/config/supabase/server";
import { setDefaultPaymentMethodCore } from "@/utils/paymentMethodCore";

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

  return setDefaultPaymentMethodCore(supabase, user.id, paymentMethodId);
}
