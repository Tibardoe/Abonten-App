import { gatePartnerName } from "@abonten/core/gatePartners/gateLinkRules";
import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

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
  /** Checked in by a partner's gate system (gate partner connectors). */
  partner_gate?: string | null;
  ticket_checkout_id?: string | null;
  occurrence: { starts_at: string; ends_at: string | null } | null;
  ticket_type: {
    type?: string | null;
    description?: string | null;
    amount_mode?: string | null;
    event: {
      id: string;
      organizer_id: string;
      postponed_at: string | null;
    } | null;
  } | null;
};

/**
 * What the door shows after a scan: the ticket type and its note, and for
 * a ticket whose amount the buyer chose (open-amount tickets) the amount
 * paid, so staff load that many credits ("Paid GH₵150").
 */
export type CheckedInTicket = {
  /** The type's name as stored (a code for FREE / SINGLE TICKET). */
  type: string | null;
  /** What the ticket includes (ticket_type.description). */
  note: string | null;
  /** The amount paid, major units; null for a fixed-price ticket. */
  paidAmount: { amount: number; currency: string } | null;
};

export type CheckInTicketCoreResult =
  | { status: 400 | 403 | 404 | 409 | 500; message: string }
  | {
      status: 200;
      message: string;
      eventId: string | null;
      ticket?: CheckedInTicket;
    };

// A `TKT-XXXXXXXX` human code (what the ticket QR encodes) vs. the raw
// ticket UUID. Passing a non-UUID string into `.eq("id", …)` makes Postgres
// throw a cast error, so the two have to be routed to different columns.
const TICKET_CODE_RE = /^TKT-[A-Z0-9]+$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Anything else a scanner reads may be a gate partner's code (Hapniin's
// TCK-…): looked up only to say where those tickets are checked in.
const PARTNER_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,63}$/i;

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
  const byPartnerCode =
    !byCode && !UUID_RE.test(ref) && PARTNER_CODE_RE.test(ref);
  const select =
    "id, status, partner_gate, ticket_checkout_id, occurrence:occurrence_id(starts_at, ends_at), ticket_type:ticket_type_id(type, description, amount_mode, event:event_id(id, organizer_id, postponed_at))";

  const { data: rawTicket, error: ticketError } = byPartnerCode
    ? await supabase
        .from("ticket")
        .select(select)
        .in("partner_code", [...new Set([ref, ref.toUpperCase()])])
        .limit(1)
        .maybeSingle()
    : await supabase
        .from("ticket")
        .select(select)
        .eq(byCode ? "ticket_code" : "id", ref)
        .maybeSingle();

  if (ticketError || !rawTicket) {
    return {
      status: 404,
      message:
        byCode || byPartnerCode
          ? tr("thatCodeDoesnTMatchA")
          : tr("ticketNotFound"),
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

  // The organizer's own gate system admits these tickets with the
  // partner's code; Abonten's door does not (docs/architecture/
  // gate-partner-connectors.md). Checking in here would mean nothing there.
  if (ticket.partner_gate) {
    return {
      status: 409,
      message: tr("gatePartnerCheckInElsewhere", {
        partner: gatePartnerName(ticket.partner_gate),
      }),
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

  // A postponed event has no date yet: nobody comes in on the old one.
  if (checkedIn && ticket.ticket_type?.event?.postponed_at) {
    return { status: 400, message: tr("thisEventIsPostponedNoEntry") };
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

  // An amount the buyer chose: the door shows what was paid. Read before the
  // ticket moves (service role: the caller was authorised above, and a team
  // member cannot read the line through their own session), so a scan that
  // cannot show the amount admits nobody and can simply be repeated.
  let paidAmount: CheckedInTicket["paidAmount"] = null;
  if (checkedIn && ticket.ticket_type?.amount_mode === "open") {
    const { data: line, error: lineError } = ticket.ticket_checkout_id
      ? await getSupabaseServiceClient()
          .from("ticket_checkout")
          .select(
            "open_amount, unit_price, ticket_type:ticket_type_id(currency)",
          )
          .eq("id", ticket.ticket_checkout_id)
          .maybeSingle()
      : { data: null, error: null };
    if (lineError) {
      logger.error(`Error reading the amount paid: ${lineError.message}`);
      return { status: 500, message: tr("somethingWentWrong") };
    }
    const currency = (
      line?.ticket_type as { currency?: string | null } | null | undefined
    )?.currency;
    if (line?.open_amount && line.unit_price != null && currency) {
      paidAmount = { amount: Number(line.unit_price), currency };
    }
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
    ticket: {
      type: ticket.ticket_type?.type ?? null,
      note: ticket.ticket_type?.description ?? null,
      paidAmount,
    },
  };
}
