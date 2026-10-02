"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type CheckoutPaymentOptionsResult,
  type CheckoutPaymentTarget,
  getCheckoutPaymentOptionsCore,
} from "@abonten/services/payments/checkoutPaymentOptionsCore";

/**
 * The ways this buyer can pay for one order — the market's methods and which
 * saved instruments work there. Same service as the mobile
 * GET /api/mobile/payments/options.
 */
export default withActionLocale(async function getCheckoutPaymentOptions(
  target: CheckoutPaymentTarget,
): Promise<CheckoutPaymentOptionsResult | { status: 401; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { status: 401, message: tr("userNotLoggedIn") };

  return getCheckoutPaymentOptionsCore(supabase, user.id, target, "web");
});
