"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UpdateEventTicketTypesCoreResult,
  updateEventTicketTypesCore,
} from "@abonten/services/events/updateEventTicketTypesCore";
import type { Ticket } from "@abonten/types/ticketType";

export type UpdateEventTicketTypesInput = {
  eventId: string;
  freeEvents: string | null;
  currency: string | null | undefined;
  singleTicket: number | null;
  singleTicketQuantity: number | null;
  multipleTickets: Ticket[];
};

/**
 * Adds a ticket-types editor to event editing — but only while it's safe:
 * ticket types stay fully editable right up until the event has its first
 * confirmed ticket, and become read-only after that (Part 6 of the Unified
 * Event Management spec). Query body shared with the mobile
 * PUT /api/mobile/organizer/events/:id/ticket-types route via
 * @/utils/updateEventTicketTypesCore; this wrapper only adds auth and maps
 * ManageEventDetailsSection's string-mode form shape onto the core input.
 */
export default async function updateEventTicketTypes(
  input: UpdateEventTicketTypesInput,
): Promise<
  UpdateEventTicketTypesCoreResult | { status: 401; message: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not authenticated" };
  }

  return updateEventTicketTypesCore(supabase, user.id, {
    eventId: input.eventId,
    currency: input.currency,
    freeEvent: input.freeEvents === "Free",
    singleTicket:
      input.singleTicket != null
        ? { price: input.singleTicket, quantity: input.singleTicketQuantity }
        : null,
    multipleTickets: (input.multipleTickets ?? []).map((ticket) => ({
      type: ticket.category ?? ticket.type ?? "",
      price: ticket.price,
      quantity: ticket.quantity ?? null,
      availableFrom: ticket.availableFrom ?? ticket.available_from ?? null,
      availableUntil: ticket.availableUntil ?? ticket.available_until ?? null,
    })),
  });
}
