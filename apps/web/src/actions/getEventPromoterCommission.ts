"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
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

    return getEventPromoterCommissionCore(supabase, user.id, eventId);
  },
);
