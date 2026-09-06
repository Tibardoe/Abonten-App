import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of checkInTicket, lifted so the mobile
// POST /api/mobile/organizer/tickets/:id/check-in route runs the exact same
// transition. The only place ticket.status ever moves to/from 'used' — every
// other transition (active -> cancelled) stays in cancelUserTicket.ts. This
// is the single source of "verified attendance" that postEventReview.ts /
// getEventReviewEligibility.ts gate reviews on. checkedIn=false lets an
// organizer undo a mis-tap. Deliberately NOT a "use server" file — the
// caller does its own revalidatePath with the returned eventId.

type TicketRow = {
  id: string;
  status: string;
  ticket_type: {
    event: { id: string; organizer_id: string } | null;
  } | null;
};

export type CheckInTicketCoreResult =
  | { status: 400 | 403 | 404 | 500; message: string }
  | { status: 200; message: string; eventId: string | null };

// A `TKT-XXXXXXXX` human code (what the ticket QR encodes) vs. the raw
// ticket UUID. Passing a non-UUID string into `.eq("id", …)` makes Postgres
// throw a cast error, so the two have to be routed to different columns.
const TICKET_CODE_RE = /^TKT-[A-Z0-9]+$/i;

/**
 * @param ticketRef  either the ticket's UUID (the attendee-list toggle) or
 *   its `TKT-…` code parsed out of a scanned QR (the organizer scanner).
 */
export async function checkInTicketCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  ticketRef: string,
  checkedIn: boolean,
): Promise<CheckInTicketCoreResult> {
  const ref = ticketRef.trim();
  const byCode = TICKET_CODE_RE.test(ref);

  const { data: rawTicket, error: ticketError } = await supabase
    .from("ticket")
    .select(
      "id, status, ticket_type:ticket_type_id(event:event_id(id, organizer_id))",
    )
    .eq(byCode ? "ticket_code" : "id", ref)
    .maybeSingle();

  if (ticketError || !rawTicket) {
    return {
      status: 404,
      message: byCode
        ? "That code doesn't match a ticket for this event."
        : "Ticket not found",
    };
  }

  const ticket = rawTicket as unknown as TicketRow;
  const organizerId = ticket.ticket_type?.event?.organizer_id;

  if (!organizerId || organizerId !== userId) {
    return { status: 403, message: "Not authorized to check in this ticket" };
  }

  if (checkedIn && ticket.status !== "active") {
    return {
      status: 400,
      message:
        ticket.status === "used"
          ? "This ticket is already checked in."
          : "Only active tickets can be checked in.",
    };
  }

  if (!checkedIn && ticket.status !== "used") {
    return { status: 400, message: "This ticket isn't checked in." };
  }

  const { error: updateError } = await supabase
    .from("ticket")
    .update({
      status: checkedIn ? "used" : "active",
      used_at: checkedIn ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticket.id);

  if (updateError) {
    logger.error(
      `Error updating ticket check-in status: ${updateError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    message: checkedIn ? "Checked in successfully" : "Check-in undone",
    eventId: ticket.ticket_type?.event?.id ?? null,
  };
}
