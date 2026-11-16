"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { getPlaceVisitPanelCore } from "@abonten/services/places/placeVisitCore";
import { actorReachesPlace } from "@abonten/services/teams/actingAccount";
import type { PlaceVisitPanel } from "@abonten/types/rewards";

/**
 * The owner's check-in panel for a place: the QR code right now (it changes
 * every 30 seconds) and the visit figures. Same service as
 * GET /api/mobile/organizer/places/[placeId]/visit-code.
 */
export const getPlaceVisitPanel = withActionLocale(
  async function getPlaceVisitPanel(placeId: string): Promise<{
    status: number;
    message?: string;
    data?: PlaceVisitPanel;
  }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("userNotLoggedIn") };
    if (typeof placeId !== "string") {
      return { status: 400, message: tr("placeIsRequired") };
    }
    // Managing as a team: the front desk shows the team's place's code.
    const actor = await actingFor(user.id, "visit.show");
    if (actor.error) return actor.error;
    // Front desk limited to some of a chain's places.
    if (!actorReachesPlace(actor, placeId)) {
      return { status: 403, message: tr("teamPlaceNotYours") };
    }

    return getPlaceVisitPanelCore(
      supabase,
      actor.accountId,
      placeId,
      process.env.NEXT_PUBLIC_BASE_URL || undefined,
    );
  },
);
