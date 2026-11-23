"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlaceSpecialHoursCoreResult,
  removePlaceSpecialHoursCore,
} from "@abonten/services/places/placeSpecialHoursCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile DELETE /api/mobile/organizer/places/:placeId/special-hours/:id
// route). Removes one special date from the place's hours.
export const removePlaceSpecialHours = withActionLocale(
  async function removePlaceSpecialHours(
    placeId: string,
    specialHoursId: string,
  ): Promise<
    PlaceSpecialHoursCoreResult | { status: 401 | 403; message: string }
  > {
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

    return removePlaceSpecialHoursCore(
      supabase,
      actor.accountId,
      placeId,
      specialHoursId,
    );
  },
);
