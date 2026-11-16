"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { addEventPromoterCore } from "@abonten/services/rewards/promoterCommissionCore";
import type { EventPromoterCommission } from "@abonten/types/rewards";

/**
 * Adds a promoter to one of the caller's events by username, with their own
 * rate (basis points) or the event's (null). Same service as
 * POST /api/mobile/organizer/events/[eventId]/promoters.
 */
export const addEventPromoter = withActionLocale(
  async function addEventPromoter(input: {
    eventId: string;
    username: string;
    rateBps: number | null;
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
      typeof input.username !== "string" ||
      (input.rateBps !== null && typeof input.rateBps !== "number")
    ) {
      return { status: 400, message: tr("invalidRequest2") };
    }

    // Managing as a team: Owners and Finance, who set what its events pay
    // promoters. Adding one of the team's own members takes an Owner (X36):
    // the service checks that.
    const acting = await actingFor(user.id, "promotions.buy");
    if (acting.error) return acting.error;
    return addEventPromoterCore(supabase, acting.accountId, input, user.id);
  },
);
