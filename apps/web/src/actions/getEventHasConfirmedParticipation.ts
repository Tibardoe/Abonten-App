"use server";

import { createClient } from "@/config/supabase/server";
import { getEventHasConfirmedParticipationCore } from "@/utils/getEventHasConfirmedParticipationCore";

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
 * Owner-scoped: fetches the event first and checks organizer_id, so this
 * can't be used to probe another organizer's event. Query body shared with
 * the mobile organizer routes via @/utils/getEventHasConfirmedParticipationCore.
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
    return { status: 401 as const, message: "User not authenticated" };
  }

  return getEventHasConfirmedParticipationCore(supabase, user.id, eventId);
}
