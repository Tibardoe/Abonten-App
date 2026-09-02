"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  type PreparedCheckoutPayment,
  prepareCheckoutPayment,
} from "@abonten/services/checkout/checkoutPaymentPreparation";

type PrepareMultiCheckoutPaymentResult =
  | { status: 400 | 401 | 500; message: string }
  | ({ status: 200 } & PreparedCheckoutPayment);

/**
 * Read-only, authoritative "what do I actually owe right now" check for a
 * set of selected pending checkout sessions — re-reads current DB state
 * (after self-healing expiry) rather than trusting anything the client
 * computed. Used to drive the live Pay button total, and reused internally
 * by createMultiCheckoutPaymentAttempt.ts right before it writes anything.
 */
export default async function prepareMultiCheckoutPayment(
  checkoutSessionIds: string[],
): Promise<PrepareMultiCheckoutPaymentResult> {
  if (checkoutSessionIds.length === 0) {
    return { status: 400, message: "No checkouts selected" };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  try {
    const prepared = await prepareCheckoutPayment(
      user.id,
      checkoutSessionIds,
      supabase,
    );
    return { status: 200, ...prepared };
  } catch (error) {
    logger.error(`Failed preparing checkout payment: ${error}`);
    return { status: 500, message: "Something went wrong!" };
  }
}
