"use server";

import { createClient } from "@/config/supabase/server";
import {
  type AddPaymentMethodInput,
  addPaymentMethodSchema,
} from "@/utils/paymentMethodSchema";
import type { PaymentMethodRow } from "./getUserPaymentMethods";

type AddPaymentMethodResult =
  | { status: 400 | 401 | 500; message: string }
  | { status: 200; data: PaymentMethodRow };

/**
 * Saves a new payment method for the current user. Only ever stores the
 * non-sensitive display fields validated by paymentMethodSchema (network/
 * brand, last 4 digits, expiry, label) — never a full card/PIN/mobile-money
 * number, since there is no tokenization provider behind this yet.
 */
export default async function addPaymentMethod(
  input: AddPaymentMethodInput,
): Promise<AddPaymentMethodResult> {
  const parsed = addPaymentMethodSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid payment method",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { count, error: countError } = await supabase
    .from("payment_method")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active");

  if (countError) {
    console.log(`Failed counting payment methods: ${countError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { type, ...details } = parsed.data;

  const { data, error } = await supabase
    .from("payment_method")
    .insert({
      user_id: user.id,
      method_type: type,
      details,
      is_default: (count ?? 0) === 0,
      status: "active",
    })
    .select("id, method_type, details, is_default, created_at")
    .single();

  if (error) {
    console.log(`Failed saving payment method: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: data as unknown as PaymentMethodRow };
}
