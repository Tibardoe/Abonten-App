"use server";

import { createClient } from "@/config/supabase/server";
import { getPromotionCreditCore } from "@abonten/services/rewards/promotionCreditCore";
import type { PromotionCredit } from "@abonten/types/rewards";

/**
 * The signed-in user's promotion credit: what they can spend on featuring,
 * what the monthly organizer / venue rebates earned them, and the live
 * terms. Same service as GET /api/mobile/rewards/promotion-credit.
 */
export async function getPromotionCredit(): Promise<{
  status: number;
  message?: string;
  data?: PromotionCredit;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };

  return getPromotionCreditCore(supabase, user.id);
}
