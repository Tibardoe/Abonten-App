"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import {
  type GetTicketCheckoutCoreResult,
  getTicketCheckoutCore,
} from "@abonten/services/checkout/getTicketCheckoutCore";
import { tr } from "@abonten/services/i18n/requestLocale";

export default withActionLocale(async function getTicketCheckout(
  checkoutSessionId: string,
): Promise<GetTicketCheckoutCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  return await getTicketCheckoutCore(supabase, user.id, checkoutSessionId);
});
