"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type PlacePhotoCoreResult,
  addPlacePhotoCore,
} from "@abonten/services/places/placePhotoCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/:placeId/photos route). Records
// one place_photo row after a gallery photo finished uploading directly to
// Cloudinary — the bytes never pass through a Server Action body.
export const addPlacePhoto = withActionLocale(async function addPlacePhoto(
  placeId: string,
  publicId: string,
  version: string,
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

  return addPlacePhotoCore(supabase, user.id, placeId, publicId, version);
});
