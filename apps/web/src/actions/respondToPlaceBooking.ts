"use server";

import { createClient } from "@/config/supabase/server";
import { respondToPlaceBookingCore } from "@abonten/services/places/placeBookingsReviewsCore";

type RespondToPlaceBookingInput = {
  bookingId: string;
  decision: "accept" | "decline";
};

/**
 * Owner-only accept/decline of a pending booking request. Thin wrapper —
 * auth here, ownership + the race guard + the customer notification in
 * respondToPlaceBookingCore (shared with /api/mobile).
 */
export async function respondToPlaceBooking(
  formData: RespondToPlaceBookingInput,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  return respondToPlaceBookingCore(
    supabase,
    user.id,
    formData.bookingId,
    formData.decision,
  );
}
