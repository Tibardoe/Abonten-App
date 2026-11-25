import { groupPricingProblemMessage } from "@abonten/core/groupPricing";
import { logger } from "@abonten/core/logger";
import {
  type TicketAmountMode,
  openAmountTypeProblemMessage,
} from "@abonten/core/openAmountTickets";
import { ticketCapacityProblem } from "@abonten/core/ticketCapacity";
import {
  SINGLE_TICKET_TYPE,
  paidTierProblem,
  ticketTierProblemMessage,
} from "@abonten/core/ticketTiers";
import {
  normalizeTicketTypeNote,
  ticketTypeNotesProblemMessage,
} from "@abonten/core/ticketTypeNote";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gatePartnerLockRefusal } from "../gatePartners/gatePartnerConfig";
import { coreT, tr } from "../i18n/requestLocale";
import { requireVerifiedIdentity } from "../identity/identityCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { getEventHasConfirmedParticipationCore } from "./getEventHasConfirmedParticipationCore";
import { groupPricingProblem } from "./groupPricingAccess";
import {
  openAmountColumns,
  openAmountTicketsProblem,
} from "./openAmountAccess";

// Post-auth body of updateEventTicketTypes, lifted so the
// PUT /api/mobile/organizer/events/:id/ticket-types route runs the exact
// same lock-gated ticket editor as the web Server Action. Deliberately NOT
// a "use server" file.
//
// Ticket types stay fully editable right up until the event has its first
// confirmed ticket (paid or free registration — see
// getEventHasConfirmedParticipationCore), and become entirely read-only
// after that (Part 6 of the Unified Event Management spec — "full lock after
// first sale"). What each type includes (its note) is the exception: it
// changes no money and stays editable through updateTicketTypeNotesCore. Before that point an in-flight (pending, unpaid) checkout
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
    /** Purchases on sale (a Couple counts once); null = no limit. */
    quantity: number | null;
    /** People one purchase admits (a Couple: 2). Default 1. */
    admits?: number | null;
    availableFrom?: DateInput | null;
    availableUntil?: DateInput | null;
    /** What the ticket includes (@abonten/core/ticketTypeNote). */
    description?: string | null;
    /**
     * "open": the buyer chooses the amount, from minAmount to maxAmount in
     * steps of amountStep (major units); the price is the minimum
     * (@abonten/core/openAmountTickets). Default "fixed".
     */
    amountMode?: TicketAmountMode | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    amountStep?: number | null;
  }[];
};

export type UpdateEventTicketTypesCoreResult = {
  status: 200 | 400 | 403 | 404 | 409 | 500;
  message: string;
};

export async function updateEventTicketTypesCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: UpdateEventTicketTypesCoreInput,
): Promise<UpdateEventTicketTypesCoreResult> {
  const { eventId, freeEvent, singleTicket } = input;
  // A linked event's tickets must stay what the partner sells.
  const gateLocked = await gatePartnerLockRefusal(eventId, "edit");
  if (gateLocked) return gateLocked;
  // A type whose amount the buyer chooses is priced at its minimum and
  // admits one person, whatever the client sent.
  const multipleTickets = (input.multipleTickets ?? []).map((tier) =>
    tier.amountMode === "open"
      ? { ...tier, price: tier.minAmount ?? 0, admits: 1 }
      : tier,
  );

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

  // What each ticket type includes: plain text, one line, no links.
  if (!freeEvent) {
    const noteProblem = ticketTypeNotesProblemMessage(
      coreT(),
      multipleTickets.map((tier) => tier.description),
    );
    if (noteProblem) return { status: 400, message: noteProblem };
  }

  // Group tickets: valid, and switched on for this organizer when used.
  const groupProblem = await groupPricingProblem(userId, {
    freeEvent,
    tiers: multipleTickets,
  });
  if (groupProblem) {
    return {
      status: groupProblem === "not_enabled" ? 403 : 400,
      message: groupPricingProblemMessage(coreT(), groupProblem),
    };
  }
  // Quantities are stored as places (people): purchases x admits.
  const places = (tier: { quantity: number | null; admits?: number | null }) =>
    tier.quantity == null
      ? null
      : tier.quantity * Math.max(1, tier.admits ?? 1);

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

  // Amounts the buyer chooses: a valid range in the event's currency, and
  // switched on for this organizer when used at all.
  const amountProblem = await openAmountTicketsProblem(userId, {
    freeEvent,
    currency,
    tiers: freeEvent ? [] : multipleTickets,
  });
  if (amountProblem) {
    return {
      status: amountProblem === "not_enabled" ? 403 : 400,
      message: openAmountTypeProblemMessage(coreT(), amountProblem),
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

  // Selling tickets needs a traceable organizer, when that is required.
  if (
    !freeEvent &&
    [...(singleTicket ? [singleTicket] : []), ...multipleTickets].some(
      (tier) => tier.price > 0,
    )
  ) {
    const identityGate = await requireVerifiedIdentity(
      getSupabaseServiceClient(),
      userId,
      "paid_events",
    );
    if (identityGate) {
      return {
        status: identityGate.status === 503 ? 500 : 409,
        message: identityGate.message ?? tr("somethingWentWrong"),
      };
    }
  }

  // The quantities that are set must fit inside the event's capacity; the
  // types without one share what is left (@abonten/core/ticketCapacity).
  // The database re-checks this on insert, this is the friendly copy.
  if (!freeEvent) {
    const capacityProblem = ticketCapacityProblem(coreT(), event.capacity, [
      ...(singleTicket ? [singleTicket] : []),
      ...multipleTickets.map((tier) => ({ ...tier, quantity: places(tier) })),
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
          admits: 1,
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
                admits: 1,
                available_from: null,
                available_until: null,
              },
            ]
          : []),
        ...multipleTickets.map((ticket) => ({
          type: ticket.type,
          price: ticket.price,
          quantity: places(ticket),
          admits: Math.max(1, ticket.admits ?? 1),
          available_from: toIso(ticket.availableFrom),
          available_until: toIso(ticket.availableUntil),
          currency,
          description: normalizeTicketTypeNote(ticket.description),
          ...openAmountColumns(ticket),
        })),
      ];

  if (ticketTypesPayload.length === 0) {
    return { status: 400, message: tr("atLeastOneTicketTypeIs") };
  }

  const { data: existingTicketTypes, error: existingTicketTypesError } =
    await supabase
      .from("ticket_type")
      .select("id, type, pass_shows")
      .eq("event_id", eventId);

  if (existingTicketTypesError) {
    logger.error(
      `Failed fetching existing ticket types: ${existingTicketTypesError.message}`,
    );
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const existingIds = (existingTicketTypes ?? []).map((t) => t.id);
  // A pass type (docs/architecture/show-passes.md) is set up from the run,
  // not in this editor: it stays a pass when it is saved again by name.
  const passShowsByName = new Map(
    (existingTicketTypes ?? [])
      .filter((t) => t.pass_shows != null)
      .map((t) => [(t.type ?? "").trim().toLowerCase(), t.pass_shows]),
  );

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

  // A type saved again by the name of a pass stays a pass; a type whose
  // amount the buyer chooses can't be one.
  const reusedPass = ticketTypesPayload.find(
    (t) =>
      "amount_mode" in t &&
      t.amount_mode === "open" &&
      passShowsByName.has(t.type.trim().toLowerCase()),
  );
  if (reusedPass) {
    return {
      status: 400,
      message: openAmountTypeProblemMessage(coreT(), "pass"),
    };
  }

  const { error: insertError } = await supabase.from("ticket_type").insert(
    ticketTypesPayload.map((t) => ({
      ...t,
      event_id: eventId,
      pass_shows: passShowsByName.get(t.type.trim().toLowerCase()) ?? null,
    })),
  );

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
