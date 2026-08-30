"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";

/**
 * Whether an event already has at least one confirmed ticket — paid or free
 * registration, both insert a `ticket` row (see registerForFreeEvent.ts and
 * generateTicket.ts) — as opposed to an unpaid/pending `ticket_checkout` or
 * a fully cancelled ticket. This is the single source of truth the Unified
 * Event Management edit-locking rules are built on: once true, dates,
 * location, capacity and ticket types stop being freely editable (see
 * updateEvent.ts / updateEventTicketTypes.ts), because changing them could
 * affect people who already hold a real ticket.
 *
 * Owner-scoped: fetches the event first and checks organizer_id, same
 * fetch-then-compare pattern as getEventForEdit.ts, so this can't be used to
 * probe another organizer's event.
 */
export default async function getEventHasConfirmedParticipation(
  eventId: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 404, message: "Event not found or unauthorized" };
  }

  const { data: ticketTypes, error: ticketTypesError } = await supabase
    .from("ticket_type")
    .select("id")
    .eq("event_id", eventId);

  if (ticketTypesError) {
    logger.error(
      `Failed fetching ticket types for event ${eventId}: ${ticketTypesError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const ticketTypeIds = (ticketTypes ?? []).map((t) => t.id);

  if (ticketTypeIds.length === 0) {
    return { status: 200, data: false };
  }

  const { count, error: ticketError } = await supabase
    .from("ticket")
    .select("id", { count: "exact", head: true })
    .in("ticket_type_id", ticketTypeIds)
    .neq("status", "cancelled");

  if (ticketError) {
    logger.error(
      `Failed checking confirmed tickets for event ${eventId}: ${ticketError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (count ?? 0) > 0 };
}
