"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import { listActivePromotionsCore } from "@abonten/services/promotions/activePromotionsCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

export type { ActivePromotionSummary } from "@abonten/types/promotionSummaryType";

// Settings "Promotion Details": every live or queued promotion across what
// the signed-in user owns — featured events and places and promoted
// Spotlights. Thin transport over listActivePromotionsCore, which the
// mobile GET /api/mobile/account/promotions route shares. The service reads
// with the service role and filters every query by the caller's id, which
// is resolved here from the cookie session.
export const getUserActivePromotions = withActionLocale(
  async function getUserActivePromotions() {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: 401, message: tr("notAuthenticated") };
    }

    try {
      return await listActivePromotionsCore(
        getSupabaseServiceClient(),
        user.id,
      );
    } catch (error) {
      logger.error("getUserActivePromotions failed", error);
      return { status: 500, message: tr("somethingWentWrong") };
    }
  },
);
