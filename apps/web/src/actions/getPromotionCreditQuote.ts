"use server";

import { createClient } from "@/config/supabase/server";
import {
  type PromotionCreditQuoteResult,
  getPromotionCreditQuoteCore,
} from "@abonten/services/rewards/creditRedemptionCore";

/**
 * How much Abonten Credit the "Use credit" switch can apply to a pending
 * promotion checkout, and what would be left to pay. Same service as
 * GET /api/mobile/checkout/promotion-credit-quote.
 */
export async function getPromotionCreditQuote(input: {
  kind: "event" | "place";
  checkoutId: string;
}): Promise<PromotionCreditQuoteResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  return getPromotionCreditQuoteCore(supabase, user.id, input);
}
