"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type RequestMobileMoneyCodeInput,
  type RequestMobileMoneyCodeResult,
  requestMobileMoneyNumberCodeCore,
} from "@abonten/services/payments/mobileMoneyNumberCheck";
import { headers } from "next/headers";

/**
 * First step of saving a mobile money wallet or payout account: texts a code
 * to the number, unless it is the person's own verified phone
 * (`needsCode: false`). The save then carries the code.
 */
export default withActionLocale(async function requestMobileMoneyNumberCode(
  input: RequestMobileMoneyCodeInput,
): Promise<RequestMobileMoneyCodeResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  // For the per-address cap on text messages (see requestPhoneVerification).
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  return requestMobileMoneyNumberCodeCore(supabase, user.id, input, ip);
});
