import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";

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
  occurrence: { starts_at: string; ends_at: string | null } | null;
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

const HOUR_MS = 60 * 60 * 1000;

/**
 * @param ticketRef  either the ticket's UUID (the attendee-list toggle) or
 *   its `TKT-…` code parsed out of a scanned QR (the organizer scanner).
 * @param expectedEventId  the event whose gate is doing the scanning. The
 *   organizer check below only proves the ticket belongs to ONE of the
 *   caller's events — an organizer running two events on the same night
 *   could otherwise scan a ticket for event A at event B's door and mark it
 *   used, so the holder is then turned away at the event they actually paid
 *   for. Omitted (undefined) keeps the old event-agnostic behaviour for any
 *   caller that genuinely has no event in context.
 */
export async function checkInTicketCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  ticketRef: string,
  checkedIn: boolean,
  expectedEventId?: string | null,
): Promise<CheckInTicketCoreResult> {
  const ref = ticketRef.trim();
  const byCode = TICKET_CODE_RE.test(ref);

  const { data: rawTicket, error: ticketError } = await supabase
    .from("ticket")
    .select(
      "id, status, occurrence:occurrence_id(starts_at, ends_at), ticket_type:ticket_type_id(event:event_id(id, organizer_id))",
    )
    .eq(byCode ? "ticket_code" : "id", ref)
    .maybeSingle();

  if (ticketError || !rawTicket) {
    return {
      status: 404,
      message: byCode ? tr("thatCodeDoesnTMatchA") : tr("ticketNotFound"),
    };
  }

  const ticket = rawTicket as unknown as TicketRow;
  const organizerId = ticket.ticket_type?.event?.organizer_id;

  if (!organizerId || organizerId !== userId) {
    return { status: 403, message: tr("notAuthorizedToCheckInThis") };
  }

  if (expectedEventId && ticket.ticket_type?.event?.id !== expectedEventId) {
    return {
      status: 404,
      message: tr("thatTicketIsForADifferent"),
    };
  }

  if (checkedIn && ticket.status !== "active") {
    return {
      status: 400,
      message:
        ticket.status === "used"
          ? tr("thisTicketIsAlreadyCheckedIn")
          : tr("onlyActiveTicketsCanBeChecked"),
    };
  }

  // A ticket bought for one date of a multi-date event admits only on that
  // date: refuse it well before its start or well after its end (generous
  // windows — doors open early and shows overrun).
  if (checkedIn && ticket.occurrence) {
    const now = Date.now();
    const starts = new Date(ticket.occurrence.starts_at).getTime();
    const ends = ticket.occurrence.ends_at
      ? new Date(ticket.occurrence.ends_at).getTime()
      : starts + 24 * HOUR_MS;
    if (starts - now > 12 * HOUR_MS) {
      return {
        status: 400,
        message: tr("thisTicketIsForALater"),
      };
    }
    if (now - ends > 6 * HOUR_MS) {
      return {
        status: 400,
        message: tr("thisTicketWasForAnEarlier"),
      };
    }
  }

  if (!checkedIn && ticket.status !== "used") {
    return { status: 400, message: tr("thisTicketIsnTCheckedIn") };
  }

  // Conditional on the status just read: two doors scanning the same code
  // at the same moment both read 'active', and only one may admit it.
  const { data: moved, error: updateError } = await supabase
    .from("ticket")
    .update({
      status: checkedIn ? "used" : "active",
      used_at: checkedIn ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticket.id)
    .eq("status", checkedIn ? "active" : "used")
    .select("id")
    .maybeSingle();

  if (!updateError && !moved) {
    return {
      status: 400,
      message: checkedIn
        ? tr("thisTicketIsAlreadyCheckedIn")
        : tr("thisTicketIsnTCheckedIn"),
    };
  }

  if (updateError) {
    logger.error(
      `Error updating ticket check-in status: ${updateError.message}`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }

  return {
    status: 200,
    message: checkedIn ? tr("checkedInSuccessfully") : tr("checkInUndone"),
    eventId: ticket.ticket_type?.event?.id ?? null,
  };
}
