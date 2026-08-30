"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import createNotification from "./createNotification";

type RespondToPlaceBookingInput = {
  bookingId: string;
  decision: "accept" | "decline";
};

/**
 * Owner-only accept/decline of a pending booking request. Ownership is
 * enforced by joining through to the owning place, same "fetch through the
 * join, compare owner_id" pattern respondToPlaceReview.ts uses (a
 * place_booking row has no owner_id of its own). Guarded by
 * `.eq("status", "pending")` on the update so two tabs/admins racing to
 * respond to the same request can't both "succeed" -- mirrors
 * reviewPlaceClaimRequest.ts's rejection-branch race guard. Notifies the
 * customer of the outcome either way.
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
    return { status: 401, message: "User not authenticated" };
  }

  const { bookingId, decision } = formData;

  const { data: booking, error: fetchError } = await supabase
    .from("place_booking")
    .select("id, status, customer_id, place:place_id(owner_id, name, slug)")
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

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one ownership check; no generated Supabase types exist in this repo (see PROJECT.md) -- same convention respondToPlaceReview.ts uses
  const place = (booking as any).place;

  if (place?.owner_id !== user.id) {
    return {
      status: 403,
      message: "Not authorized to respond to this booking",
    };
  }

  if (booking.status !== "pending") {
    return {
      status: 409,
      message: "This booking has already been responded to.",
    };
  }

  const newStatus = decision === "accept" ? "accepted" : "declined";

  const { data: updatedRows, error: updateError } = await supabase
    .from("place_booking")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select("id");

  if (updateError) {
    logger.error(`Error responding to booking: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!updatedRows || updatedRows.length === 0) {
    return {
      status: 409,
      message: "This booking has already been responded to.",
    };
  }

  const placeName = place?.name ?? "the place";

  const notifyResult = await createNotification(
    {
      userId: booking.customer_id,
      type: `place_booking_${newStatus}`,
      title:
        newStatus === "accepted"
          ? "Your booking was accepted"
          : "Your booking was declined",
      body:
        newStatus === "accepted"
          ? `Your booking request for ${placeName} was accepted.`
          : `Your booking request for ${placeName} was declined.`,
      link: place?.slug ? `/places/${place.slug}` : null,
    },
    supabase,
  );

  if (notifyResult.status !== 200) {
    logger.error(
      `Failed to notify customer of booking response: ${notifyResult.message}`,
    );
  }

  return {
    status: 200,
    message:
      newStatus === "accepted" ? "Booking accepted." : "Booking declined.",
  };
}
