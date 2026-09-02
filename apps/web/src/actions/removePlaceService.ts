"use server";

import { createClient } from "@/config/supabase/server";
import {
  type PlaceServiceCoreResult,
  removePlaceServiceCore,
} from "@/utils/placeServiceCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/places/services/:serviceId/delete route).
export async function removePlaceService(
  serviceId: string,
): Promise<PlaceServiceCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  return removePlaceServiceCore(supabase, user.id, serviceId);
}
