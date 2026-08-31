"use server";

import { createClient } from "@/config/supabase/server";
import {
  type ListPaymentMethodsResult,
  listPaymentMethodsCore,
} from "@/utils/paymentMethodCore";

export type {
  CardPaymentMethodDetails,
  MomoPaymentMethodDetails,
  PaymentMethodRow,
} from "@/utils/paymentMethodCore";

/**
 * Every saved payment method for the current user — independent of any
 * checkout. This is the sole data source for /wallet and for the payment
 * method selector shown inside ticket/subscription checkout; it must never
 * be gated on a pending checkout existing.
 */
export default async function getUserPaymentMethods(): Promise<
  ListPaymentMethodsResult | { status: 401; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return listPaymentMethodsCore(supabase, user.id);
}
