"use server";

import { createClient } from "@/config/supabase/server";
import {
  type PlacePhotoCoreResult,
  reorderPlacePhotosCore,
} from "@abonten/services/places/placePhotoCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/:placeId/photos/reorder route).
export async function reorderPlacePhotos(
  placeId: string,
  photoIds: string[],
): Promise<PlacePhotoCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  return reorderPlacePhotosCore(supabase, user.id, placeId, photoIds);
}
