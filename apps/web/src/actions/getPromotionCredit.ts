"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getPromotionCreditCore } from "@abonten/services/rewards/promotionCreditCore";
import type { PromotionCredit } from "@abonten/types/rewards";

/**
 * The signed-in user's promotion credit: what they can spend on featuring,
 * what the monthly organizer / venue rebates earned them, and the live
 * terms. Same service as GET /api/mobile/rewards/promotion-credit.
 */
export const getPromotionCredit = withActionLocale(
  async function getPromotionCredit(): Promise<{
    status: number;
    message?: string;
    data?: PromotionCredit;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };

    return getPromotionCreditCore(supabase, user.id);
  },
);
