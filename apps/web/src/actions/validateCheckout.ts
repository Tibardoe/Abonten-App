"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import { storedToTouch } from "@abonten/core/rewards/referralAttribution";
import {
  type CheckoutDetailsProp,
  type ValidateCheckoutResult,
  validateCheckoutCore,
} from "@abonten/services/checkout/validateCheckoutCore";
import {
  DEVICE_COOKIE_NAME,
  REFERRAL_COOKIE_NAME,
  decodeReferralCookie,
} from "@abonten/services/rewards/referralCookie";
import { recordDeviceInstallCore } from "@abonten/services/rewards/referralCore";
import type { ReferralHint } from "@abonten/types/rewards";
import { cookies } from "next/headers";

// The event referral links this browser opened (signed abn_ref cookie, set
// by proxy.ts), as hints for the checkout. Keys are `e:<event slug>`; the
// core matches them to the event and re-validates everything.
async function referralHintsFromCookie(): Promise<{
  hints: ReferralHint[];
  installId: string | null;
}> {
  try {
    const store = await cookies();
    const map = decodeReferralCookie(store.get(REFERRAL_COOKIE_NAME)?.value);
    const hints: ReferralHint[] = [];
    for (const [key, stored] of Object.entries(map)) {
      const touch = storedToTouch(stored);
      if (key.startsWith("e:") && touch) {
        hints.push({ ...touch, eventSlug: key.slice(2) });
      }
    }
    return { hints, installId: store.get(DEVICE_COOKIE_NAME)?.value ?? null };
  } catch (error) {
    logger.error(`Could not read the referral cookie: ${error}`);
    return { hints: [], installId: null };
  }
}

export default async function validateCheckout(
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
      message: "User not logged in",
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
}
