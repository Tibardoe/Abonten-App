import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import {
  type AddPaymentMethodInput,
  addPaymentMethodSchema,
} from "@abonten/validation/paymentMethodSchema";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth bodies of the four payment-method Server Actions, lifted so the
// `/api/mobile/payment-methods/*` routes run the exact same logic. Each
// takes an already-authenticated Supabase client + the resolved userId.
// Deliberately NOT a "use server" file (see ticketInventory.ts).

export type MomoPaymentMethodDetails = {
  networkCode: string;
  networkName: string;
  phone: string;
  label?: string;
};

export type CardPaymentMethodDetails = {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  authorizationCode: string;
  bank?: string | null;
  label?: string;
};

export type PaymentMethodRow = {
  id: string;
  method_type: "momo" | "card";
  details: MomoPaymentMethodDetails | CardPaymentMethodDetails;
  is_default: boolean;
  created_at: string;
};

export type ListPaymentMethodsResult =
  | { status: 500; message: string }
  | { status: 200; data: PaymentMethodRow[] };

export async function listPaymentMethodsCore(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ListPaymentMethodsResult> {
  const { data, error } = await supabase
    .from("payment_method")
    .select("id, method_type, details, is_default, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    logger.error(`Failed fetching payment methods: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as unknown as PaymentMethodRow[] };
}

export type AddPaymentMethodResult =
  | { status: 400 | 500; message: string }
  | { status: 200; data: PaymentMethodRow };

export async function addPaymentMethodCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: AddPaymentMethodInput,
): Promise<AddPaymentMethodResult> {
  const parsed = addPaymentMethodSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: 400,
      message: parsed.error.issues[0]?.message ?? "Invalid payment method",
    };
  }

  const { count, error: countError } = await supabase
    .from("payment_method")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "active");

  if (countError) {
    logger.error(`Failed counting payment methods: ${countError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { type, ...details } = parsed.data;

  const { data, error } = await supabase
    .from("payment_method")
    .insert({
      user_id: userId,
      method_type: type,
      details,
      is_default: (count ?? 0) === 0,
      status: "active",
    })
    .select("id, method_type, details, is_default, created_at")
    .single();

  if (error) {
    logger.error(`Failed saving payment method: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: data as unknown as PaymentMethodRow };
}

export type MutatePaymentMethodResult = {
  status: 200 | 404 | 500;
  message: string;
};

export async function removePaymentMethodCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  paymentMethodId: string,
): Promise<MutatePaymentMethodResult> {
  const { data: method, error: fetchError } = await supabase
    .from("payment_method")
    .select("id, is_default")
    .eq("id", paymentMethodId)
    .eq("user_id", userId)
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
    .update({
      status: "removed",
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentMethodId)
    .eq("user_id", userId);

  if (removeError) {
    logger.error(`Failed removing payment method: ${removeError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (method.is_default) {
    const { data: nextDefault } = await supabase
      .from("payment_method")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nextDefault) {
      await supabase
        .from("payment_method")
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq("id", nextDefault.id)
        .eq("user_id", userId);
    }
  }

  return { status: 200, message: "Payment method removed" };
}

export async function setDefaultPaymentMethodCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  paymentMethodId: string,
): Promise<MutatePaymentMethodResult> {
  const { data: method, error: fetchError } = await supabase
    .from("payment_method")
    .select("id")
    .eq("id", paymentMethodId)
    .eq("user_id", userId)
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
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_default", true)
    .neq("id", paymentMethodId);

  if (unsetError) {
    logger.error(`Failed clearing previous default: ${unsetError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: setError } = await supabase
    .from("payment_method")
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("id", paymentMethodId)
    .eq("user_id", userId)
    .eq("status", "active");

  if (setError) {
    logger.error(`Failed setting default payment method: ${setError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Default payment method updated" };
}
