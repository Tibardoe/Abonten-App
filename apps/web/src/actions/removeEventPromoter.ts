"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { removeEventPromoterCore } from "@abonten/services/rewards/promoterCommissionCore";
import type { EventPromoterCommission } from "@abonten/types/rewards";

/**
 * Takes a promoter off one of the caller's events. Same service as
 * DELETE /api/mobile/organizer/events/[eventId]/promoters/[userId].
 */
export const removeEventPromoter = withActionLocale(
  async function removeEventPromoter(input: {
    eventId: string;
    promoterId: string;
  }): Promise<{
    status: number;
    message?: string;
    data?: EventPromoterCommission;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };
    if (
      typeof input?.eventId !== "string" ||
      typeof input.promoterId !== "string"
    ) {
      return { status: 400, message: tr("invalidRequest2") };
    }

    const acting = await actingFor(user.id, "promotions.buy");
    if (acting.error) return acting.error;
    return removeEventPromoterCore(supabase, acting.accountId, input, user.id);
  },
);
