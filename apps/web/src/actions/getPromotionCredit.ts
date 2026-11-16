"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
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

    // Managing as a team: its credit, for the members who see its money.
    const actor = await actingFor(user.id, "money.view");
    if (actor.error) return actor.error;

    return getPromotionCreditCore(supabase, actor.accountId);
  },
);
