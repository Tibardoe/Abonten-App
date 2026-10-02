"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
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

    return setPlaceTemporaryStatusCore(
      supabase,
      user.id,
      placeId,
      temporaryStatus,
      temporaryStatusNote,
    );
  },
);
