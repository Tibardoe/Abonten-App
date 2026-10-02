"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlacePhotoCoreResult,
  removePlacePhotoCore,
} from "@abonten/services/places/placePhotoCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/:placeId/photos/:photoId/delete
// route). Deletes the place_photo row and best-effort Cloudinary asset.
export const removePlacePhoto = withActionLocale(
  async function removePlacePhoto(
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

    return removePlacePhotoCore(supabase, user.id, photoId);
  },
);
