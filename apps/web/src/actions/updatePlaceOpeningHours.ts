"use server";

import { createClient } from "@/config/supabase/server";
import {
  type PlaceHoursStatusCoreResult,
  updatePlaceOpeningHoursCore,
} from "@/utils/placeHoursStatusCore";
import type { PlaceOpeningHoursInput } from "@abonten/types/placeType";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile PUT /api/mobile/organizer/places/:id/hours route). Replaces the
// entire weekly schedule wholesale.
export async function updatePlaceOpeningHours(
  placeId: string,
  openingHours: PlaceOpeningHoursInput[],
): Promise<PlaceHoursStatusCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  return updatePlaceOpeningHoursCore(supabase, user.id, placeId, openingHours);
}
