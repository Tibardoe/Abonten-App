import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import {
  resolveOccurrenceState,
  validatePurchaseOccurrence,
} from "@abonten/core/eventPurchaseEligibility";
import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateQRCodeDataURL,
  generateTicketCode,
} from "../tickets/generateTicketCode";
import { insertUserAttendanceCore } from "../tickets/insertUserAttendance";
import { saveEventQrCodeToCloudinary } from "../tickets/saveEventQrCodeToCloudinary";
import {
  releaseTicketQuantity,
  reserveTicketQuantity,
} from "./ticketInventory";

// Post-auth body of registerForFreeEvent, shared by the "use server" action
// and the mobile API route (`/api/mobile/checkout/free-rsvp`) so both run
// the exact same one-click RSVP. Caller supplies an already-authenticated
// Supabase client + resolved userId. Quantity is always exactly 1 and is
// never taken from the client. `revalidatePath` and the confirmation email
// (React template + Resend) stay in apps/web: the caller passes
// `onRegistered`, which the web wrapper schedules via next/server `after`.

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
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
  occurrenceId?: string | null,
  onRegistered?: (ticketId: string) => void,
): Promise<RegisterForFreeEventCoreResult> {
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

  // Same authoritative sales-window check as validateCheckoutCore (the paid
  // path): an RSVP may only be taken while a strictly-future session
  // remains. `resolveEventEndDate` is still used below for the ticket's
  // `expires_at` (the last session's end), which is a different question.
  const occurrenceState = resolveOccurrenceState(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  if (occurrenceState.blockReason === "no_dates") {
    logger.error(`Event ${eventId} has no resolvable start/end date`);
    return { status: 500, message: "This event has no scheduled date" };
  }

  if (occurrenceState.blockReason === "ended") {
    return { status: 409, message: "This event has ended." };
  }

  if (occurrenceState.blockReason === "ongoing_no_future") {
    return {
      status: 409,
      message: "This event is currently in progress and has no upcoming dates.",
    };
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

  // occurrenceId is client-supplied and affects a DB write, so verify it
  // belongs to this event (same check validateCheckoutCore does) AND that
  // the chosen date has not already started while later dates remain.
  if (occurrenceId) {
    const occurrenceCheck = validatePurchaseOccurrence(
      occurrenceId,
      event.event_occurrence,
    );

    if (!occurrenceCheck.ok) {
      return occurrenceCheck.reason === "unknown"
        ? { status: 400, message: "Invalid event date" }
        : {
            status: 409,
            message: "That date has already started — pick an upcoming date.",
          };
    }
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
      qr_version: String(uploadResponse.version),
      expires_at: eventEndDate.toISOString(),
      used_at: null,
      transaction_id: null,
      seat_number: null,
      status: "active",
      ticket_code: ticketCode,
      created_at: new Date().toISOString(),
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

  const attendanceInsertResponse = await insertUserAttendanceCore(
    supabase,
    userId,
    eventId,
    ticketType.id,
    [insertedTicket.id],
  );

  if (attendanceInsertResponse.status !== 200) {
    return {
      status: attendanceInsertResponse.status,
      message: attendanceInsertResponse.message ?? "Something went wrong!",
    };
  }

  // The confirmation email (React PDF + Resend) is apps/web-only — the
  // caller schedules it via next/server `after` once this returns 200.
  onRegistered?.(insertedTicket.id);

  return {
    status: 200,
    message: "Event registered successfully",
    eventCode: event.event_code,
  };
}
