"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlaceServiceCoreResult,
  removePlaceServiceCore,
} from "@abonten/services/places/placeServiceCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/services/:serviceId/delete route).
export const removePlaceService = withActionLocale(
  async function removePlaceService(
    serviceId: string,
  ): Promise<PlaceServiceCoreResult | { status: 401; message: string }> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        status: 401 as const,
        message: tr("userNotAuthenticated"),
      };
    }

    // Managing as a team: the chosen team, if the person's role covers this.

    const actor = await actingFor(user.id, "places.manage");

    if (actor.error) return actor.error;

    return removePlaceServiceCore(supabase, actor.accountId, serviceId);
  },
);
