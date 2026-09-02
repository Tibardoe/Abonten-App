"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  type CheckoutDetailsProp,
  type ValidateCheckoutResult,
  validateCheckoutCore,
} from "@abonten/services/checkout/validateCheckoutCore";

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

  return validateCheckoutCore(supabase, user.id, details);
}
