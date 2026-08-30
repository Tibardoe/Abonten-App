"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

export type EventCancellationImpact = {
  paidTicketCount: number;
  freeTicketCount: number;
  attendeeCount: number;
};

// No generated Supabase types exist in this repo (see PROJECT.md) — the RPC
// result is cast the same way generateTicket.ts/validateCheckout.ts already
// cast untyped query results.
type EventCancellationImpactRow = {
  paid_ticket_count: number;
  free_ticket_count: number;
  attendee_count: number;
};

/**
 * Server-verified counts for the cancel-event confirmation dialog -- never
 * trust client-side assumptions about how many attendees/paid tickets an
 * event has. Backed by the get_event_cancellation_impact RPC, which has to
 * be SECURITY DEFINER since ticket/attendance RLS is scoped to the ticket
 * holder's own user_id, not the organizer.
 */
export default async function getEventCancellationImpact(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data, error } = await supabase
    .rpc("get_event_cancellation_impact", { p_event_id: eventId })
    .maybeSingle();

  if (error) {
    logger.error(`Error fetching event cancellation impact: ${error.message}`);
    const notOwned = error.message?.includes("not owned");
    return {
      status: notOwned ? 403 : 500,
      message: notOwned
        ? "Not authorized to view this event"
        : "Could not load cancellation details. Please try again.",
    };
  }

  if (!data) {
    return { status: 404, message: "Event not found" };
  }

  const row = data as unknown as EventCancellationImpactRow;

  const impact: EventCancellationImpact = {
    paidTicketCount: row.paid_ticket_count,
    freeTicketCount: row.free_ticket_count,
    attendeeCount: row.attendee_count,
  };

  return { status: 200, data: impact };
}
