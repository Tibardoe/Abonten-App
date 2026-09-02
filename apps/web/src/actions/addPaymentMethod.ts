"use server";

import { createClient } from "@/config/supabase/server";
import {
  type AddPaymentMethodResult,
  addPaymentMethodCore,
} from "@abonten/services/payments/paymentMethodCore";
import type { AddPaymentMethodInput } from "@abonten/validation/paymentMethodSchema";

/**
 * Saves a new payment method for the current user. Only ever stores the
 * non-sensitive display fields validated by paymentMethodSchema (network/
 * brand, last 4 digits, expiry, label) — a card's reusable
 * `authorizationCode` is captured server-side by a real GHS 1 verification
 * charge (confirmCardVerification.ts), never typed in.
 */
export default async function addPaymentMethod(
  input: AddPaymentMethodInput,
): Promise<AddPaymentMethodResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return addPaymentMethodCore(supabase, user.id, input);
}
