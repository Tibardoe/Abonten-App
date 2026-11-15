"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlaceHoursStatusCoreResult,
  type PlaceTemporaryStatus,
  setPlaceTemporaryStatusCore,
} from "@abonten/services/places/placeHoursStatusCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/:id/status route).
export const setPlaceTemporaryStatus = withActionLocale(
  async function setPlaceTemporaryStatus(
    placeId: string,
    temporaryStatus: PlaceTemporaryStatus,
    temporaryStatusNote?: string | null,
  ): Promise<PlaceHoursStatusCoreResult | { status: 401; message: string }> {
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

    return setPlaceTemporaryStatusCore(
      supabase,
      actor.accountId,
      placeId,
      temporaryStatus,
      temporaryStatusNote,
    );
  },
);
