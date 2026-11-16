"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { setEventPromoterCommissionCore } from "@abonten/services/rewards/promoterCommissionCore";
import type { EventPromoterCommission } from "@abonten/types/rewards";

/**
 * Sets the promoter commission on one of the caller's events (basis points),
 * or stops it (null). Same service as
 * PUT /api/mobile/organizer/events/[eventId]/promoter-commission.
 */
export const setEventPromoterCommission = withActionLocale(
  async function setEventPromoterCommission(input: {
    eventId: string;
    rateBps: number | null;
    /** Only invited promoters earn (X33); left out = unchanged. */
    invitedOnly?: boolean;
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
      (input.rateBps !== null && typeof input.rateBps !== "number") ||
      (input.invitedOnly !== undefined &&
        typeof input.invitedOnly !== "boolean")
    ) {
      return { status: 400, message: tr("invalidRequest2") };
    }

    // Managing as a team: the commission comes off the team's earnings, so
    // the members who pay for its promotion set it (Owners and Finance).
    const acting = await actingFor(user.id, "promotions.buy");
    if (acting.error) return acting.error;
    return setEventPromoterCommissionCore(
      supabase,
      acting.accountId,
      input,
      user.id,
    );
  },
);
