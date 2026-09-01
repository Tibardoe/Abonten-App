import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEventHasConfirmedParticipationCore } from "./getEventHasConfirmedParticipationCore";

// Post-auth body of updateEventTicketTypes, lifted so the
// PUT /api/mobile/organizer/events/:id/ticket-types route runs the exact
// same lock-gated ticket editor as the web Server Action. Deliberately NOT
// a "use server" file.
//
// Ticket types stay fully editable right up until the event has its first
// confirmed ticket (paid or free registration — see
// getEventHasConfirmedParticipationCore), and become entirely read-only
// after that (Part 6 of the Unified Event Management spec — "full lock after
// first sale"). Before that point an in-flight (pending, unpaid) checkout
// can still FK-reference a ticket_type row this is about to delete
// (ticket_checkout_ticket_type_id_fkey is ON DELETE RESTRICT), so that case
// is checked first and returned as a clear message instead of a raw DB error.

type DateInput = string | Date;

export type UpdateEventTicketTypesCoreInput = {
  eventId: string;
  currency: string | null | undefined;
  freeEvent: boolean;
  singleTicket: { price: number; quantity: number | null } | null;
  multipleTickets: {
    type: string;
    price: number;
    quantity: number | null;
    availableFrom?: DateInput | null;
    availableUntil?: DateInput | null;
  }[];
};

export type UpdateEventTicketTypesCoreResult = {
  status: 200 | 400 | 404 | 409 | 500;
  message: string;
};

export async function updateEventTicketTypesCore(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateEventTicketTypesCoreInput,
): Promise<UpdateEventTicketTypesCoreResult> {
  const { eventId, currency, freeEvent, singleTicket } = input;
  const multipleTickets = input.multipleTickets ?? [];

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, capacity")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 404, message: "Event not found or unauthorized" };
  }

  const participation = await getEventHasConfirmedParticipationCore(
    supabase,
    userId,
    eventId,
  );
  if (participation.status !== 200) {
    return { status: participation.status, message: participation.message };
  }
  if (participation.data) {
    return {
      status: 409,
      message:
        "Ticket types can't be changed anymore — this event already has confirmed tickets.",
    };
  }

  const ticketTypesPayload = freeEvent
    ? [
        {
          type: "FREE",
          price: 0,
          currency,
          quantity: event.capacity ?? null,
          available_from: null,
          available_until: null,
        },
      ]
    : [
        ...(singleTicket
          ? [
              {
                type: "SINGLE TICKET",
                price: singleTicket.price,
                currency,
                quantity: singleTicket.quantity,
                available_from: null,
                available_until: null,
              },
            ]
          : []),
        ...multipleTickets.map((ticket) => ({
          type: ticket.type,
          price: ticket.price,
          quantity: ticket.quantity,
          available_from: ticket.availableFrom ?? null,
          available_until: ticket.availableUntil ?? null,
          currency,
        })),
      ];

  if (ticketTypesPayload.length === 0) {
    return { status: 400, message: "At least one ticket type is required." };
  }

  const { data: existingTicketTypes, error: existingTicketTypesError } =
    await supabase.from("ticket_type").select("id").eq("event_id", eventId);

  if (existingTicketTypesError) {
    logger.error(
      `Failed fetching existing ticket types: ${existingTicketTypesError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const existingIds = (existingTicketTypes ?? []).map((t) => t.id);

  if (existingIds.length > 0) {
    // Self-heal first (same idiom as every checkout kind's expiry sweep) so a
    // stale pending checkout from an abandoned session doesn't block a
    // legitimate edit.
    await supabase.rpc("expire_stale_ticket_checkouts");

    const { count: pendingCount, error: pendingError } = await supabase
      .from("ticket_checkout")
      .select("id", { count: "exact", head: true })
      .in("ticket_type_id", existingIds)
      .eq("status", "pending");

    if (pendingError) {
      logger.error(
        `Failed checking pending checkouts: ${pendingError.message}`,
      );
      return { status: 500, message: "Something went wrong!" };
    }

    if ((pendingCount ?? 0) > 0) {
      return {
        status: 409,
        message:
          "Someone is currently checking out for this event. Please try again in a few minutes.",
      };
    }

    const { error: deleteError } = await supabase
      .from("ticket_type")
      .delete()
      .eq("event_id", eventId);

    if (deleteError) {
      logger.error(`Failed deleting old ticket types: ${deleteError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }
  }

  const { error: insertError } = await supabase
    .from("ticket_type")
    .insert(ticketTypesPayload.map((t) => ({ ...t, event_id: eventId })));

  if (insertError) {
    logger.error(`Failed inserting new ticket types: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Ticket types updated successfully!" };
}
