"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import { fetchPlaceInsights } from "@abonten/services/organizer/organizerReadQuery";

// Thin wrapper: auth, then delegate to the shared body used by the mobile
// GET /api/mobile/organizer/places/:id/insights route too — no fork.
export const getPlaceInsights = withActionLocale(
  async function getPlaceInsights(placeId: string) {
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

    return fetchPlaceInsights(supabase, actor.accountId, placeId);
  },
);
