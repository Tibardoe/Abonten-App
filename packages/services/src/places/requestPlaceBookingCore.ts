import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationCore } from "../notifications/createNotification";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Post-auth bodies of requestPlaceBooking.ts / cancelPlaceBooking.ts, lifted
// so the mobile place-detail "Book" flow + the "My bookings" cancel run the
// exact same rules as the web Server Actions. NOT a "use server" file: each
// function takes an already-resolved SupabaseClient<Database> (the caller's Bearer /
// cookie session) + userId.
//
// The `place_booking` insert / update itself is done with the CALLER's
// client so RLS (`place_booking_customer_insert` / `_customer_update`,
// `auth.uid() = customer_id`) applies unchanged. The owner NOTIFICATION,
// however, writes a `notification` row for a *different* user, and
// `notification` has RLS enabled with no client INSERT policy (every
// notification is system-generated). So that write goes through the
// service-role client, the same way sendPushNotification.ts / the webhook
// notification paths already do. This also repairs a latent bug in the
// pre-existing web actions, whose cookie-client createNotification call was
// silently denied by that same missing policy.

export type RequestPlaceBookingInput = {
  placeId: string;
  serviceId?: string | null;
  requestedTime: string; // ISO string
  partySize?: number | null;
  note?: string | null;
};

export type RequestPlaceBookingCoreResult = {
  status: 200 | 400 | 401 | 403 | 404 | 500;
  message: string;
};

/**
 * Reservation REQUEST only (confirmed scope) — no in-app payment, no
 * inventory/slot model. Inserts a 'pending' place_booking row and notifies
 * the place's owner. The owner later accepts/declines via
 * respondToPlaceBookingCore.
 */
export async function requestPlaceBookingCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: RequestPlaceBookingInput,
): Promise<RequestPlaceBookingCoreResult> {
  const { placeId, serviceId, requestedTime, partySize, note } = input;

  const parsedTime = new Date(requestedTime);

  if (Number.isNaN(parsedTime.getTime())) {
    return { status: 400, message: "Please choose a valid date and time." };
  }

  if (parsedTime.getTime() <= Date.now()) {
    return { status: 400, message: "Please choose a time in the future." };
  }

  if (partySize != null && (!Number.isFinite(partySize) || partySize < 1)) {
    return { status: 400, message: "Party size must be at least 1." };
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

  if (place.owner_id === userId) {
    return { status: 400, message: "You cannot book your own place" };
  }

  const { error: insertError } = await supabase.from("place_booking").insert({
    place_id: placeId,
    service_id: serviceId ?? null,
    customer_id: userId,
    requested_time: parsedTime.toISOString(),
    party_size: partySize ?? null,
    note: note ?? null,
    status: "pending",
  });

  if (insertError) {
    logger.error(`Error inserting place booking: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await notifyOwner(place.owner_id, {
    type: "place_booking_requested",
    title: "New booking request",
    body: `You have a new booking request for ${place.name}.`,
    link: `/manage/places/${placeId}`,
  });

  return { status: 200, message: "Booking request sent!" };
}

export type CancelPlaceBookingCoreResult = {
  status: 200 | 401 | 403 | 404 | 409 | 500;
  message: string;
};

/**
 * Customer-only cancellation of their own booking. Both 'pending' and
 * 'accepted' bookings can be cancelled; 'declined'/'cancelled' are already
 * final. Notifies the place's owner (a booking they may have accepted just
 * got cancelled).
 */
export async function cancelPlaceBookingCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  bookingId: string,
): Promise<CancelPlaceBookingCoreResult> {
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

  if (booking.customer_id !== userId) {
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

  // biome-ignore lint/suspicious/noExplicitAny: PostgREST's embedded-resource shape isn't worth a dedicated type for this one notification lookup; no generated Supabase types exist in this repo (see PROJECT.md)
  const place = (booking as any).place;

  if (place?.owner_id) {
    await notifyOwner(place.owner_id, {
      type: "place_booking_cancelled",
      title: "A booking was cancelled",
      body: `A customer cancelled their booking for ${place.name ?? "your place"}.`,
      link: `/manage/places/${booking.place_id}`,
    });
  }

  return { status: 200, message: "Booking cancelled." };
}

async function notifyOwner(
  ownerId: string,
  notification: {
    type: string;
    title: string;
    body: string;
    link: string | null;
  },
): Promise<void> {
  try {
    const serviceClient = getSupabaseServiceClient();
    const result = await createNotificationCore(serviceClient, {
      userId: ownerId,
      ...notification,
    });
    if (result.status !== 200) {
      logger.error(`Failed to notify place owner: ${result.message}`);
    }
  } catch (error) {
    // A missing service-role key or a transient failure must never fail the
    // booking write itself — the row already exists.
    logger.error("Failed to notify place owner (notification skipped)", error);
  }
}
