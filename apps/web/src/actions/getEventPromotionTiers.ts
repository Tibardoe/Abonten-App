"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { EventPromotionTier } from "@abonten/types/postsType";

// event_promotion_tier is a small, seeded lookup table (4 rows -- 24 hours/
// 3 days/7 days/1 month) -- mirrors getPlacePromotionTiers.ts exactly.
export const getEventPromotionTiers = withActionLocale(
  async function getEventPromotionTiers() {
    const supabase = publicSupabase;

    const { data, error } = await supabase
      .from("event_promotion_tier")
      .select("*")
      .eq("is_active", true)
      .order("id");

    if (error) {
      logger.error(`Error fetching event promotion tiers: ${error.message}`);
      return { status: 500, message: tr("somethingWentWrong") };
    }

    return { status: 200, data: (data ?? []) as EventPromotionTier[] };
  },
);
