import insertUserAttendance from "@/actions/insertUserAttendance";
import { saveEventQrCodeToCloudinary } from "@/actions/saveEventQrCodeToCloudinary";
import ticketPurchaseNotification from "@/actions/ticketPurchaseNotification";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "@/utils/generateTicketCode";
import {
  releaseTicketQuantity,
  reserveTicketQuantity,
} from "@/utils/ticketInventory";
import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import type { AuthOverride } from "@abonten/types/authOverrideType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

// Post-auth body of registerForFreeEvent, lifted so the mobile API route
// (`/api/mobile/checkout/free-rsvp`) and the "use server" action run the
// exact same one-click RSVP. Caller supplies an already-authenticated
// Supabase client + resolved userId. Quantity is always exactly 1 and is
// never taken from the client. `revalidatePath` stays in the web wrapper;
// the confirmation email is scheduled here (via `after`) so both platforms
// send it. Deliberately NOT a "use server" file (see validateCheckoutCore.ts).

type TicketWithEvent = {
  user_id: string;
  ticket_type_id: { event_id: string };
  status: string;
};

export type RegisterForFreeEventCoreResult = {
  status: number;
  message: string;
  eventCode?: string;
};

export async function registerForFreeEventCore(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  occurrenceId?: string | null,
): Promise<RegisterForFreeEventCoreResult> {
  const authOverride: AuthOverride = { supabase, userId };

  const { data: rawTicketData, error: ticketDataError } = await supabase
    .from("ticket")
    .select("user_id, status, ticket_type_id(event_id)")
    .eq("user_id", userId);

  if (ticketDataError || !rawTicketData) {
    logger.error(`Error fetching ticket data: ${ticketDataError?.message}`);
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
    logger.error(`Failed fetching event: ${eventFetchError?.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  // The caller's copy of event status can be stale (cached detail page) —
  // never trust it, re-check the live row.
  if (event.status !== "published") {
    return { status: 409, message: "This event is no longer accepting RSVPs." };
  }

  const eventEndDate = resolveEventEndDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  if (!eventEndDate) {
    logger.error(`Event ${eventId} has no resolvable start/end date`);
    return { status: 500, message: "This event has no scheduled date" };
  }

  if (eventEndDate < new Date()) {
    return { status: 409, message: "This event has ended." };
  }

  // occurrenceId is client-supplied and affects a DB write, so verify it
  // belongs to this event (same check validateCheckoutCore does).
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
    return {
      status: reservation.status,
      message: reservation.message ?? "That ticket is no longer available.",
    };
  }

  const ticketCode = generateTicketCode();
  const qrCodeBase64 = await generateQRCodeDataURL(ticketCode);
  const uploadResponse = await saveEventQrCodeToCloudinary(
    qrCodeBase64,
    ticketCode,
  );

  if ("error" in uploadResponse) {
    logger.error(`Error saving QR code to cloudinary:${uploadResponse.error}`);
    await releaseTicketQuantity(ticketType.id, 1);
    return { status: 500, message: "Something went wrong!" };
  }

  const { data: insertedTicket, error: insertTicketError } = await supabase
    .from("ticket")
    .insert({
      user_id: userId,
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
    logger.error(`Error inserting ticket: ${insertTicketError?.message}`);
    await releaseTicketQuantity(ticketType.id, 1);
    return { status: 500, message: "Something went wrong!" };
  }

  const attendanceInsertResponse = await insertUserAttendance(
    eventId,
    ticketType.id,
    [insertedTicket.id],
    authOverride,
  );

  if (attendanceInsertResponse.status !== 200) {
    return {
      status: attendanceInsertResponse.status,
      message: attendanceInsertResponse.message ?? "Something went wrong!",
    };
  }

  // Runs after the response is sent — see generateTicket.ts. Never throws.
  after(() =>
    ticketPurchaseNotification([insertedTicket.id], 0, authOverride).catch(
      (error) => logger.error(`Failed sending ticket purchase email: ${error}`),
    ),
  );

  return {
    status: 200,
    message: "Event registered successfully",
    eventCode: event.event_code,
  };
}
