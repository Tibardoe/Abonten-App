"use server";

import { createClient } from "@/config/supabase/server";
import { fetchPlaceInsights } from "@abonten/services/organizer/organizerReadQuery";

// Thin wrapper: auth, then delegate to the shared body used by the mobile
// GET /api/mobile/organizer/places/:id/insights route too — no fork.
export async function getPlaceInsights(placeId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  return fetchPlaceInsights(supabase, user.id, placeId);
}
