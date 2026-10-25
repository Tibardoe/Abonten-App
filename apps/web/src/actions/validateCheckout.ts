"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { referralHintsFromCookie } from "@/utils/referralHintsFromCookie";
import { logger } from "@abonten/core/logger";
import {
  type CheckoutDetailsProp,
  type ValidateCheckoutResult,
  validateCheckoutCore,
} from "@abonten/services/checkout/validateCheckoutCore";
import { tr } from "@abonten/services/i18n/requestLocale";
import { recordDeviceInstallCore } from "@abonten/services/rewards/referralCore";

export default withActionLocale(async function validateCheckout(
  details: CheckoutDetailsProp,
): Promise<ValidateCheckoutResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    logger.error(`Error fetching user: ${userError?.message}`);

    return {
      status: 401,
      message: tr("userNotLoggedIn"),
    };
  }

  const { hints, installId } = await referralHintsFromCookie();
  await recordDeviceInstallCore(installId, user.id, "web");

  return validateCheckoutCore(supabase, user.id, {
    ...details,
    // Only what the server read from its own signed cookie -- never a
    // referral passed in by the browser.
    referralHints: hints,
  });
});
