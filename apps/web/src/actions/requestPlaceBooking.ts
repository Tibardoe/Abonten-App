"use server";

import { createClient } from "@/config/supabase/server";
import {
  type RequestPlaceBookingInput,
  requestPlaceBookingCore,
} from "@abonten/services/places/requestPlaceBookingCore";

/**
 * Thin web transport over `requestPlaceBookingCore` — resolves the cookie
 * session, then delegates every rule (future-time validation, owner block,
 * pending insert, owner notification) to the shared service so the mobile
 * `POST /api/mobile/places/[placeId]/bookings` route runs it verbatim.
 */
export async function requestPlaceBooking(formData: RequestPlaceBookingInput) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  return requestPlaceBookingCore(supabase, user.id, formData);
}
