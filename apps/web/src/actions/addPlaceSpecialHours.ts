"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import type { SpecialHoursInput } from "@abonten/core/placeSpecialHours";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlaceSpecialHoursCoreResult,
  addPlaceSpecialHoursCore,
} from "@abonten/services/places/placeSpecialHoursCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/:placeId/special-hours route).
// Adds a special date (a holiday) to the place's hours, or replaces the
// one already set for that date.
export const addPlaceSpecialHours = withActionLocale(
  async function addPlaceSpecialHours(
    placeId: string,
    input: SpecialHoursInput,
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

    return addPlaceSpecialHoursCore(supabase, actor.accountId, placeId, input);
  },
);
