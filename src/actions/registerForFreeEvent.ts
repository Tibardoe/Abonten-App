"use server";

import { createClient } from "@/config/supabase/server";
import { resolveEventEndDate } from "@/utils/dateFormatter";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "@/utils/generateTicketCode";
import {
  releaseTicketQuantity,
  reserveTicketQuantity,
} from "@/utils/ticketInventory";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import insertUserAttendance from "./insertUserAttendance";
import { saveEventQrCodeToCloudinary } from "./saveEventQrCodeToCloudinary";
import ticketPurchaseNotification from "./ticketPurchaseNotification";

type TicketWithEvent = {
  user_id: string;
  ticket_type_id: {
    event_id: string;
  };
  status: string;
};

/**
 * One-click RSVP for events that only offer a free "FREE" ticket type — no
 * checkout session needed since there's no price/promo/payment involved.
 * Quantity is always exactly 1 and is never taken from the client, so this
 * can't be used to claim more than one free ticket per request the way the
 * old generateTicket(eventId, ticketInputs, ...) signature allowed when
 * ticketInputs came straight from the browser.
 */
export default async function registerForFreeEvent(
  eventId: string,
  occurrenceId?: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: rawTicketData, error: ticketDataError } = await supabase
    .from("ticket")
    .select("user_id, status, ticket_type_id(event_id)")
    .eq("user_id", user.id);

  if (ticketDataError || !rawTicketData) {
    console.log(`Error fetching ticket data: ${ticketDataError?.message}`);

    return { status: 500, message: "Something went wrong" };
  }

  const ticketData = rawTicketData as unknown as TicketWithEvent[];

  const alreadyBought = ticketData?.some(
    (ticket) =>
      ticket.ticket_type_id.event_id === eventId &&
      (ticket.status === "active" || ticket.status === "used"),
  );

  if (alreadyBought) {
    return { status: 300, message: "Ticket for this event already bought" };
  }

  const { data: event, error: eventFetchError } = await supabase
    .from("event")
    .select(
      "event_code, status, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventFetchError || !event) {
    console.log(`Failed fetching event: ${eventFetchError?.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  // The client's copy of event status can be stale (ISR-cached event details
  // page) — never trust it for this decision, re-check the live row.
  if (event.status !== "published") {
    return {
      status: 409,
      message: "This event is no longer accepting RSVPs.",
    };
  }

  const eventEndDate = resolveEventEndDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  if (!eventEndDate) {
    console.log(`Event ${eventId} has no resolvable start/end date`);
    return { status: 500, message: "This event has no scheduled date" };
  }

  if (eventEndDate < new Date()) {
    return { status: 409, message: "This event has ended." };
  }

  // occurrenceId is client-supplied and now affects a DB write, so verify it
  // actually belongs to this event before trusting it (same check
  // validateCheckout.ts does for paid tickets) — reuse the occurrences
  // already fetched above rather than a second round trip.
  if (
    occurrenceId &&
    !event.event_occurrence.some((occ) => occ.id === occurrenceId)
  ) {
    return { status: 400, message: "Invalid event date" };
  }

  const { data: ticketType, error: ticketTypeError } = await supabase
    .from("ticket_type")
    .select("id")
    .eq("event_id", eventId)
    .eq("type", "FREE")
    .maybeSingle();

  if (ticketTypeError || !ticketType) {
    return {
      status: 404,
      message: "This event has no free registration available",
    };
  }

  const reservation = await reserveTicketQuantity(ticketType.id, 1);

  if (reservation.status !== 200) {
    return { status: reservation.status, message: reservation.message };
  }

  const ticketCode = generateTicketCode();
  const qrCodeBase64 = await generateQRCodeDataURL(ticketCode);
  const uploadResponse = await saveEventQrCodeToCloudinary(
    qrCodeBase64,
    ticketCode,
  );

  if (uploadResponse.error) {
    console.log(`Error saving QR code to cloudinary:${uploadResponse.error}`);

    await releaseTicketQuantity(ticketType.id, 1);

    return { status: 500, message: "Something went wrong!" };
  }

  const { data: insertedTicket, error: insertTicketError } = await supabase
    .from("ticket")
    .insert({
      user_id: user.id,
      ticket_type_id: ticketType.id,
      qr_public_id: uploadResponse.public_id,
      qr_version: uploadResponse.version,
      expires_at: eventEndDate,
      used_at: null,
      transaction_id: null,
      seat_number: null,
      status: "active",
      ticket_code: ticketCode,
      created_at: new Date(),
      updated_at: null,
      occurrence_id: occurrenceId ?? null,
    })
    .select("id")
    .maybeSingle();

  if (insertTicketError || !insertedTicket) {
    console.log(`Error inserting ticket: ${insertTicketError?.message}`);

    await releaseTicketQuantity(ticketType.id, 1);

    return { status: 500, message: "Something went wrong!" };
  }

  const attendanceInsertResponse = await insertUserAttendance(
    eventId,
    ticketType.id,
    [insertedTicket.id],
  );

  if (attendanceInsertResponse.status !== 200) {
    return {
      status: attendanceInsertResponse.status,
      message: attendanceInsertResponse.message,
    };
  }

  revalidatePath("/manage/my-events");
  revalidatePath(`/manage/events/${eventId}`);
  revalidatePath("/manage/dashboard");
  // See generateTicket.ts for why the public event page also needs this.
  revalidatePath(`/events/${event.event_code.toLowerCase()}`);

  // Runs after this response is sent — see generateTicket.ts for why this
  // is scheduled with after() rather than awaited inline.
  after(() =>
    ticketPurchaseNotification([insertedTicket.id], 0).catch((error) =>
      console.log(`Failed sending ticket purchase email: ${error}`),
    ),
  );

  return { status: 200, message: "Event registered successfully" };
}
