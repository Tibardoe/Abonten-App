"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlacePhotoCoreResult,
  setPlaceCoverFromPhotoCore,
} from "@abonten/services/places/placePhotoCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/:placeId/photos/:photoId/set-cover
// route). Promotes an existing gallery photo to the place's cover.
export const setPlaceCoverFromPhoto = withActionLocale(
  async function setPlaceCoverFromPhoto(
    placeId: string,
    photoId: string,
  ): Promise<PlacePhotoCoreResult | { status: 401; message: string }> {
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

    return setPlaceCoverFromPhotoCore(supabase, user.id, placeId, photoId);
  },
);
