"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getLoyaltyProgressCore } from "@abonten/services/rewards/loyaltyCore";
import type { LoyaltyProgress } from "@abonten/types/rewards";

/**
 * The signed-in user's count towards the next loyalty fee rebate (null data
 * while it isn't live). Same service as GET /api/mobile/rewards/loyalty.
 */
export const getLoyaltyProgress = withActionLocale(
  async function getLoyaltyProgress(): Promise<{
    status: number;
    message?: string;
    data?: LoyaltyProgress | null;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };

    return getLoyaltyProgressCore(user.id);
  },
);
