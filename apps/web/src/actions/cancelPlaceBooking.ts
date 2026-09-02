"use server";

import { createClient } from "@/config/supabase/server";
import { cancelPlaceBookingCore } from "@abonten/services/places/requestPlaceBookingCore";

/**
 * Thin web transport over `cancelPlaceBookingCore` — resolves the cookie
 * session, then delegates the status guard, self-only check, the
 * cancel update and the owner notification to the shared service so the
 * mobile `POST /api/mobile/places/[placeId]/bookings/cancel` route runs it
 * verbatim.
 */
export async function cancelPlaceBooking(bookingId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  return cancelPlaceBookingCore(supabase, user.id, bookingId);
}
