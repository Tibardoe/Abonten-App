"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import createNotification from "./createNotification";

type RequestPlaceBookingInput = {
  placeId: string;
  serviceId?: string;
  requestedTime: string; // ISO string
  partySize?: number;
  note?: string;
};

/**
 * Reservation REQUEST only (confirmed scope) -- no in-app payment, no
 * inventory/slot-capacity model, unlike ticket_type. Inserts a 'pending'
 * place_booking row and notifies the place's owner, same "insert +
 * createNotification" shape reviewPlaceClaimRequest.ts's approval branch
 * uses. The owner later accepts/declines via respondToPlaceBooking.ts.
 *
 * No tab-deep-linking convention exists yet for /manage/places/[placeId]
 * (ManagePlaceView.tsx switches tabs via local useState, not a query
 * param), so the notification just links to the manage page root -- same
 * fallback reviewPlaceClaimRequest.ts's own notifications already use.
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

  const { placeId, serviceId, requestedTime, partySize, note } = formData;

  const parsedTime = new Date(requestedTime);

  if (Number.isNaN(parsedTime.getTime())) {
    return { status: 400, message: "Please choose a valid date and time." };
  }

  if (parsedTime.getTime() <= Date.now()) {
    return { status: 400, message: "Please choose a time in the future." };
  }

  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("owner_id, name")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError) {
    return {
      status: 500,
      message: `Error fetching place: ${placeError.message}`,
    };
  }

  if (!place) {
    return { status: 404, message: "Place not found" };
  }

  if (place.owner_id === user.id) {
    return { status: 400, message: "You cannot book your own place" };
  }

  const { error: insertError } = await supabase.from("place_booking").insert({
    place_id: placeId,
    service_id: serviceId ?? null,
    customer_id: user.id,
    requested_time: parsedTime.toISOString(),
    party_size: partySize ?? null,
    note: note ?? null,
    status: "pending",
  });

  if (insertError) {
    logger.error(`Error inserting place booking: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const notifyResult = await createNotification(
    {
      userId: place.owner_id,
      type: "place_booking_requested",
      title: "New booking request",
      body: `You have a new booking request for ${place.name}.`,
      link: `/manage/places/${placeId}`,
    },
    supabase,
  );

  if (notifyResult.status !== 200) {
    logger.error(
      `Failed to notify owner of booking request: ${notifyResult.message}`,
    );
  }

  return { status: 200, message: "Booking request sent!" };
}
