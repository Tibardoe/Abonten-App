"use server";

import { createClient } from "@/config/supabase/server";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "@/utils/generateTicketCode";
import insertUserAttendance from "./insertUserAttendance";
import releaseTicketQuantity from "./releaseTicketQuantity";
import reserveTicketQuantity from "./reserveTicketQuantity";
import { saveEventQrCodeToCloudinary } from "./saveEventQrCodeToCloudinary";

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
  eventEndDate: Date,
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
      ticket.ticket_type_id.event_id === eventId && ticket.status === "active",
  );

  if (alreadyBought) {
    return { status: 300, message: "Ticket for this event already bought" };
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
    1,
    ticketType.id,
  );

  if (attendanceInsertResponse.status !== 200) {
    return {
      status: attendanceInsertResponse.status,
      message: attendanceInsertResponse.message,
    };
  }

  return { status: 200, message: "Event registered successfully" };
}
