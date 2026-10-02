import { logger } from "@abonten/core/logger";
import { ticketCapacityProblem } from "@abonten/core/ticketCapacity";
import {
  SINGLE_TICKET_TYPE,
  paidTierProblem,
  ticketTierProblemMessage,
} from "@abonten/core/ticketTiers";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreT, tr } from "../i18n/requestLocale";
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

const CHECK_VIOLATION = "23514";

const toIso = (value: DateInput | null | undefined): string | null =>
  value == null ? null : value instanceof Date ? value.toISOString() : value;

async function retireEventPromoCodes(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<UpdateEventTicketTypesCoreResult | null> {
  const { error: deleteError } = await supabase
    .from("promo_code")
    .delete()
    .eq("event_id", eventId)
    .eq("times_used", 0);
  if (deleteError) {
    logger.error(`Failed removing promo codes: ${deleteError.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const { error: deactivateError } = await supabase
    .from("promo_code")
    .update({ is_active: false })
    .eq("event_id", eventId)
    .eq("is_active", true);
  if (deactivateError) {
    logger.error(`Failed deactivating promo codes: ${deactivateError.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return null;
}

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
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpdateEventTicketTypesCoreInput,
): Promise<UpdateEventTicketTypesCoreResult> {
  const { eventId, freeEvent, singleTicket } = input;
  const multipleTickets = input.multipleTickets ?? [];

  if (!freeEvent) {
    for (const tier of [
      ...(singleTicket ? [singleTicket] : []),
      ...multipleTickets,
    ]) {
      const problem = paidTierProblem(tier);
      if (problem) {
        return {
          status: 400,
          message: ticketTierProblemMessage(coreT(), problem),
        };
      }
    }
  }

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id, capacity, currency")
    .eq("id", eventId)
    .eq("organizer_id", userId)
    .maybeSingle();

  if (eventError || !event) {
    return {
      status: 404,
      message: tr("eventNotFoundOrUnauthorized"),
    };
  }

  // Every ticket type carries the event's canonical currency; a client that
  // names a different one is refused rather than silently corrected.
  const currency = event.currency;
  if (input.currency && input.currency.toUpperCase() !== currency) {
    return {
      status: 400,
      message: tr("ticketsForThisEventArePriced", {
        currency: currency,
      }),
    };
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
      message: tr("ticketTypesCanTBeChanged"),
    };
  }

  // The quantities that are set must fit inside the event's capacity; the
  // types without one share what is left (@abonten/core/ticketCapacity).
  // The database re-checks this on insert, this is the friendly copy.
  if (!freeEvent) {
    const capacityProblem = ticketCapacityProblem(coreT(), event.capacity, [
      ...(singleTicket ? [singleTicket] : []),
      ...multipleTickets,
    ]);
    if (capacityProblem) return { status: 400, message: capacityProblem };
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
                type: SINGLE_TICKET_TYPE,
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
          available_from: toIso(ticket.availableFrom),
          available_until: toIso(ticket.availableUntil),
          currency,
        })),
      ];

  if (ticketTypesPayload.length === 0) {
    return { status: 400, message: tr("atLeastOneTicketTypeIs") };
  }

  const { data: existingTicketTypes, error: existingTicketTypesError } =
    await supabase.from("ticket_type").select("id").eq("event_id", eventId);

  if (existingTicketTypesError) {
    logger.error(
      `Failed fetching existing ticket types: ${existingTicketTypesError.message}`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
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
      return { status: 500, message: tr("somethingWentWrong") };
    }

    if ((pendingCount ?? 0) > 0) {
      return {
        status: 409,
        message: tr("someoneIsCurrentlyCheckingOutFor"),
      };
    }

    const { error: deleteError } = await supabase
      .from("ticket_type")
      .delete()
      .eq("event_id", eventId);

    if (deleteError) {
      logger.error(`Failed deleting old ticket types: ${deleteError.message}`);
      return { status: 500, message: tr("somethingWentWrong") };
    }
  }

  // Paid → free: a free event has no price to discount, so its promo codes
  // go before the FREE tier is written (the database refuses a FREE tier
  // while an active code exists, and an active code while a FREE tier
  // exists). Never-used codes are deleted; used ones are deactivated so the
  // redemption history they anchor stays intact — the same rule
  // deletePromoCodeCore applies.
  if (freeEvent) {
    const retire = await retireEventPromoCodes(supabase, eventId);
    if (retire) return retire;
  }

  const { error: insertError } = await supabase
    .from("ticket_type")
    .insert(ticketTypesPayload.map((t) => ({ ...t, event_id: eventId })));

  if (insertError) {
    if (insertError.code === CHECK_VIOLATION) {
      // The capacity / free-event guards raise with an organizer-facing message.
      return {
        status: 400,
        message: userFacingError("Update ticket types", insertError),
      };
    }
    logger.error(`Failed inserting new ticket types: ${insertError.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  return {
    status: 200,
    message: tr("ticketTypesUpdatedSuccessfully"),
  };
}
