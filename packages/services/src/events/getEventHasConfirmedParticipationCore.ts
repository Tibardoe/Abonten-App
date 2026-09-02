import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of getEventHasConfirmedParticipation, lifted so the mobile
// organizer routes (and updateEventCore / updateEventTicketTypesCore) can run
// the exact same "is any editing still safe" check as the web Server Action
// without a nested createClient(). Deliberately NOT a "use server" file.
//
// Whether an event already has at least one confirmed ticket — paid or free
// registration, both insert a `ticket` row — as opposed to an unpaid/pending
// `ticket_checkout` or a fully cancelled ticket. Once true, dates, location,
// capacity and ticket types stop being freely editable.

export type EventConfirmedParticipationResult =
  | { status: 404 | 500; message: string }
  | { status: 200; data: boolean };

export async function getEventHasConfirmedParticipationCore(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<EventConfirmedParticipationResult> {
  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", userId)
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
