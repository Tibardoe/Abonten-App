"use server";

import { createClient } from "@/config/supabase/server";

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

type GetUserPaymentMethodsResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: PaymentMethodRow[] };

/**
 * Every saved payment method for the current user — independent of any
 * checkout. This is the sole data source for /wallet and for the payment
 * method selector shown inside ticket/subscription checkout; it must never
 * be gated on a pending checkout existing.
 */
export default async function getUserPaymentMethods(): Promise<GetUserPaymentMethodsResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase
    .from("payment_method")
    .select("id, method_type, details, is_default, created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.log(`Failed fetching payment methods: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as unknown as PaymentMethodRow[] };
}
