"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import createNotification from "./createNotification";

/**
 * Customer-only cancellation of their own booking. Both 'pending' and
 * 'accepted' bookings can be cancelled -- 'declined'/'cancelled' are
 * already final, so cancelling those is blocked, same "no-op on an
 * already-resolved row" guard respondToPlaceBooking.ts uses for a second
 * response. Notifies the place's owner: a booking they may have already
 * accepted just got cancelled, which is genuinely useful for them to know
 * (per the milestone spec).
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

  const { data: booking, error: fetchError } = await supabase
    .from("place_booking")
    .select("id, status, customer_id, place_id, place:place_id(owner_id, name)")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError) {
    return {
      status: 500,
      message: `Error fetching booking: ${fetchError.message}`,
    };
  }

  if (!booking) {
    return { status: 404, message: "Booking not found" };
  }

  if (booking.customer_id !== user.id) {
    return { status: 403, message: "Not authorized to cancel this booking" };
  }

  if (booking.status !== "pending" && booking.status !== "accepted") {
    return {
      status: 409,
      message: "This booking can no longer be cancelled.",
    };
  }

  const { data: updatedRows, error: updateError } = await supabase
    .from("place_booking")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .in("status", ["pending", "accepted"])
    .select("id");

  if (updateError) {
    logger.error(`Error cancelling booking: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      status: 409,
      message: "This booking can no longer be cancelled.",
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one notification lookup; no generated Supabase types exist in this repo (see PROJECT.md) -- same convention respondToPlaceBooking.ts uses
  const place = (booking as any).place;

  if (place?.owner_id) {
    const notifyResult = await createNotification(
      {
        userId: place.owner_id,
        type: "place_booking_cancelled",
        title: "A booking was cancelled",
        body: `A customer cancelled their booking for ${place.name ?? "your place"}.`,
        link: `/manage/places/${booking.place_id}`,
      },
      supabase,
    );

    if (notifyResult.status !== 200) {
      logger.error(
        `Failed to notify owner of booking cancellation: ${notifyResult.message}`,
      );
    }
  }

  return { status: 200, message: "Booking cancelled." };
}
