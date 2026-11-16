"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getEventPromoterCommissionCore } from "@abonten/services/rewards/promoterCommissionCore";
import type { EventPromoterCommission } from "@abonten/types/rewards";

/**
 * The commission the organizer offers promoters on one of their events, and
 * how promoters' sales are going. Same service as
 * GET /api/mobile/organizer/events/[eventId]/promoter-commission.
 */
export const getEventPromoterCommission = withActionLocale(
  async function getEventPromoterCommission(eventId: string): Promise<{
    status: number;
    message?: string;
    data?: EventPromoterCommission;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };
    if (typeof eventId !== "string") {
      return { status: 400, message: tr("eventIsRequired") };
    }

    // Managing as a team: Owners and Finance, who pay for its promotion.
    const acting = await actingFor(user.id, ["promotions.buy", "money.view"]);
    if (acting.error) return acting.error;
    return getEventPromoterCommissionCore(
      supabase,
      acting.accountId,
      eventId,
      user.id,
    );
  },
);
