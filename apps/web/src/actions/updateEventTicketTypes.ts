"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import type { Ticket } from "@abonten/types/ticketType";
import getEventHasConfirmedParticipation from "./getEventHasConfirmedParticipation";

export type UpdateEventTicketTypesInput = {
  eventId: string;
  freeEvents: string | null;
  currency: string | null | undefined;
  singleTicket: number | null;
  singleTicketQuantity: number | null;
  multipleTickets: Ticket[];
};

/**
 * Event editing never previously supported changing ticket types at all —
 * updateEvent.ts's own comment explains why (ticket_type.quantity is a live,
 * compare-and-swap inventory counter, and ticket_type/ticket_checkout rows
 * are FK-referenced by real purchases). This action adds that capability,
 * but only while it's actually safe: ticket types stay fully editable right
 * up until the event has its first confirmed ticket (paid or free
 * registration — see getEventHasConfirmedParticipation.ts), and become
 * entirely read-only after that (Part 6 of the Unified Event Management
 * spec — "full lock after first sale", confirmed with the project owner).
 *
 * Before this point is reached, an in-flight (pending, unpaid) checkout can
 * still reference a ticket_type row this action is about to delete —
 * ticket_checkout_ticket_type_id_fkey is ON DELETE RESTRICT, so that delete
 * would otherwise fail with a raw DB error. This checks for that case first
 * and returns a clear, actionable message instead.
 */
export default async function updateEventTicketTypes(
  input: UpdateEventTicketTypesInput,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { eventId, freeEvents, currency, singleTicket, singleTicketQuantity } =
    input;
  const multipleTickets = input.multipleTickets ?? [];

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, capacity")
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (eventError || !event) {
    return { status: 404, message: "Event not found or unauthorized" };
  }

  const participation = await getEventHasConfirmedParticipation(eventId);
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

  const isFreeEvent = freeEvents === "Free";

  const ticketTypesPayload = isFreeEvent
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
                price: singleTicket,
                currency,
                quantity: singleTicketQuantity,
                available_from: null,
                available_until: null,
              },
            ]
          : []),
        ...multipleTickets.map((ticket) => ({
          type: ticket.category,
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
    // Self-heal first, same idiom every other checkout kind's expiry sweep
    // uses (see createPaymentAttempt.ts), so a stale pending checkout from
    // an abandoned session doesn't block a legitimate edit.
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
