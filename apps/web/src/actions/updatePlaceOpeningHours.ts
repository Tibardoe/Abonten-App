"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlaceHoursStatusCoreResult,
  updatePlaceOpeningHoursCore,
} from "@abonten/services/places/placeHoursStatusCore";
import type { PlaceOpeningHoursInput } from "@abonten/types/placeType";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile PUT /api/mobile/organizer/places/:id/hours route). Replaces the
// entire weekly schedule wholesale.
export const updatePlaceOpeningHours = withActionLocale(
  async function updatePlaceOpeningHours(
    placeId: string,
    openingHours: PlaceOpeningHoursInput[],
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

    return updatePlaceOpeningHoursCore(
      supabase,
      user.id,
      placeId,
      openingHours,
    );
  },
);
