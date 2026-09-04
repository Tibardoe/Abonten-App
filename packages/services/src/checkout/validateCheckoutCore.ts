import { getCheckoutExpiryTimestamp } from "@abonten/core/checkoutExpiry";
import { validateCheckoutQuantities } from "@abonten/core/checkoutLimits";
import {
  allocatePromoEligibility,
  computeLineAmount,
} from "@abonten/core/checkoutPricing";
import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import { getPromoCodeCore } from "@abonten/services/promo-codes/getPromoCodeCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// A checkout retried right as its reservation expires re-runs this whole
// function (event lookup, promo lookup, create_ticket_checkout) each time,
// so an aggressive client-side retry loop (or a bot) churns real inventory
// reservations instead of just re-reading state. Capped generously above
// any real user's click-retry rate.
const MAX_CHECKOUT_VALIDATIONS_PER_MINUTE = 30;

// Post-auth body of validateCheckout, lifted verbatim so the mobile API
// route (`/api/mobile/checkout/validate`) and the "use server" action run
// the exact same logic — see src/actions/validateCheckout.ts. The caller
// supplies an already-authenticated Supabase client and the resolved
// userId; nothing here re-derives identity. Deliberately NOT a "use server"
// file (see ticketInventory.ts for the reasoning).

export type CheckoutDetailsProp = {
  eventId: string;
  quantities: { [ticketTypeId: string]: number };
  promoCode?: string | null;
  occurrenceId?: string | null;
};

type PendingCheckoutRow = {
  id: string;
  checkout_session_id: string;
  status: string;
  expires_at: string | null;
  ticket_type_id: string;
  quantity: number;
  promo_code: string | null;
  discounted_units: number;
};

// Not a strict discriminated union on purpose: `status` is a plain `number`
// on failure branches (it forwards other functions' numeric statuses), and
// TypeScript can't narrow a discriminated union whose discriminant isn't a
// literal on every member. `reason` lets callers (e.g. CheckoutModal.tsx)
// branch on which specific 300-status case this is without string-matching
// the display `message`, so the message text can be edited freely without
// breaking navigation.
export type ValidateCheckoutResult = {
  status: number;
  checkoutSessionId?: string;
  message?: string;
  reason?: "pending_checkout";
  checkoutId?: string;
};

export async function validateCheckoutCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  { eventId, quantities, promoCode, occurrenceId }: CheckoutDetailsProp,
): Promise<ValidateCheckoutResult> {
  // Upper-bound the requested quantities before touching inventory. Both
  // transports (web action + /api/mobile/checkout/validate) reach this
  // shared core, so this one guard covers them both — see
  // @abonten/core/checkoutLimits (limitation DOS-001).
  const quantityCheck = validateCheckoutQuantities(quantities);

  if (!quantityCheck.ok) {
    return { status: 400, message: quantityCheck.message };
  }

  const allowed = await checkRateLimit(
    `checkout-validate:${userId}`,
    MAX_CHECKOUT_VALIDATIONS_PER_MINUTE,
    60,
  );

  if (!allowed) {
    return {
      status: 429,
      message: "Too many checkout attempts. Please try again shortly.",
    };
  }

  // Reclaim anything that's timed out — for this user or anyone else —
  // before deciding whether a pending checkout is blocking this request.
  // This calls the same atomic sweep the scheduled cron job runs (see
  // migration expire_stale_ticket_checkouts), so a reservation can never
  // be released twice even if this call races the job: only the caller
  // that actually flips a row from 'pending' to 'expired' releases its
  // inventory/promo usage.
  await supabase.rpc("expire_stale_ticket_checkouts");

  // check if user has a pending ticket checkout
  const { data: ticketCheckoutData, error: ticketCheckoutDataError } =
    await supabase
      .from("ticket_checkout")
      .select(
        "id, checkout_session_id, event_id, status, expires_at, ticket_type_id, quantity, promo_code, discounted_units",
      )
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .eq("status", "pending");

  if (ticketCheckoutDataError) {
    logger.error(
      `Error fetching ticket checkout data: ${ticketCheckoutDataError.message}`,
    );

    return { status: 500, message: "Something went wrong" };
  }

  const pendingRows = (ticketCheckoutData ?? []) as PendingCheckoutRow[];

  if (pendingRows.length > 0) {
    // The sweep above already reclaims anything past its expiry, so a row
    // still 'pending' here is genuinely still active.
    return {
      status: 300,
      reason: "pending_checkout" as const,
      checkoutId: pendingRows[0].checkout_session_id,
      message: "You already have a pending ticket checkout for this event",
    };
  }

  // Deliberately no "already own a ticket for this event" block here: a
  // customer may buy any number of tickets — including multiple ticket
  // types — for the same event in one or more checkouts, limited only by
  // each ticket type's own configured `quantity` and the per-order caps in
  // @abonten/core/checkoutLimits (product decision, 2026-09-04 — see BIZ-001
  // in docs/audit/01-limitations-register.md). The pending-checkout guard
  // above is a concurrency safeguard (one in-flight reservation per event at
  // a time), not a purchase-count limit, so it stays.
  const { data: event, error: eventError } = await supabase
    .from("event")
    .select(
      "id, status, starts_at, ends_at, event_occurrence(id, starts_at, ends_at)",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    logger.error(`Failed to fetch event:${eventError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  if (!event) {
    return { status: 404, message: "No event found!" };
  }

  // The caller's copy of the event can be stale (a cached detail page held
  // open while the organizer cancels or the last date passes). These are the
  // authoritative sales-window checks — the same ones registerForFreeEventCore
  // already runs for the free path; the paid path was missing them, so an
  // ended or cancelled event could still open a paid checkout. Fixing it in
  // the shared core means web Server Actions and the mobile API both get it.
  if (event.status !== "published") {
    return {
      status: 409,
      message:
        event.status === "canceled"
          ? "This event has been canceled."
          : "This event is not currently on sale.",
    };
  }

  const eventEndDate = resolveEventEndDate(
    event.starts_at,
    event.ends_at,
    event.event_occurrence,
  );

  if (!eventEndDate) {
    logger.error(`Event ${eventId} has no resolvable start/end date`);
    return { status: 500, message: "This event has no scheduled date" };
  }

  // Whole event is over — every session's end time is in the past (covers
  // single-date past-end, all-past multi-date, and past date ranges).
  if (eventEndDate.getTime() < Date.now()) {
    return {
      status: 409,
      message: "Ticket sales for this event have closed — it has ended.",
    };
  }

  // occurrenceId is client-supplied and affects a DB write, so verify it
  // belongs to this event (a tampered client could otherwise stamp a
  // purchase with another event's occurrence id) AND that the chosen date
  // hasn't already passed while future dates of the same event remain.
  if (occurrenceId) {
    const occurrence = event.event_occurrence?.find(
      (occ: { id: string }) => occ.id === occurrenceId,
    );

    if (!occurrence) {
      return { status: 400, message: "Invalid event date" };
    }

    if (
      occurrence.ends_at &&
      new Date(occurrence.ends_at).getTime() < Date.now()
    ) {
      return {
        status: 409,
        message: "That date has already passed — pick another date.",
      };
    }
  }

  const requestedEntries = Object.entries(quantities).filter(
    ([, value]) => value > 0,
  );

  let promoCodeId: string | null = null;
  let discountPercentage = 0;
  const requestedLines = requestedEntries.map(([ticketTypeId, quantity]) => ({
    id: ticketTypeId,
    quantity,
  }));

  // Eligible-unit allocation is computed up front, across every requested
  // ticket type in one pass (first-come in requestedLines order) — see
  // checkoutPricing.ts, the same function CheckoutModal.tsx's live preview
  // uses, so the two can't drift apart.
  let eligibleUnitsByTicketType: Record<string, number> = {};

  if (promoCode) {
    const promoCodeResponse = await getPromoCodeCore(
      supabase,
      userId,
      promoCode,
      eventId,
    );

    if (promoCodeResponse.status !== 200) {
      return {
        status: promoCodeResponse.status,
        message:
          promoCodeResponse.message ?? "That promo code couldn't be applied.",
      };
    }

    promoCodeId = promoCodeResponse.id;
    discountPercentage = promoCodeResponse.discountPercentage;
    eligibleUnitsByTicketType = allocatePromoEligibility(
      requestedLines,
      promoCodeResponse.remainingUses ?? null,
    );
  }

  // Price every requested line here (read-only) — the RPC below re-verifies
  // the price and quantity atomically at write time, but the pricing
  // *decision* (unit price, discount, which lines a promo code covers)
  // stays a plain read + @abonten/core/checkoutPricing, the same function
  // the live checkout preview UI uses, so the two can never drift apart.
  const ticketTypeIds = requestedEntries.map(([id]) => id);

  const { data: ticketTypeRows, error: ticketTypeError } = await supabase
    .from("ticket_type")
    .select("id, price")
    .in("id", ticketTypeIds);

  if (ticketTypeError) {
    logger.error(`Failed to fetch ticket types: ${ticketTypeError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const priceById = new Map(
    (ticketTypeRows ?? []).map((row) => [
      row.id as string,
      row.price as number,
    ]),
  );

  const rows: {
    ticketTypeId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    discountedUnits: number;
    amount: number;
  }[] = [];

  for (const [ticketTypeId, quantity] of requestedEntries) {
    const unitPrice = priceById.get(ticketTypeId);

    if (unitPrice === undefined) {
      return {
        status: 404,
        message: `Ticket of type ${ticketTypeId} not found`,
      };
    }

    const eligibleUnits = eligibleUnitsByTicketType[ticketTypeId] ?? 0;
    const { discount, amount } = computeLineAmount(
      quantity,
      unitPrice,
      discountPercentage,
      eligibleUnits,
    );

    rows.push({
      ticketTypeId,
      quantity,
      unitPrice,
      discount,
      discountedUnits: eligibleUnits,
      amount,
    });
  }

  const expiresAt = getCheckoutExpiryTimestamp();

  // Reservation + promo claim + checkout-row insert all happen inside one
  // database transaction (create_ticket_checkout): a failure at any step —
  // including the process crashing — rolls back everything atomically, so
  // there is no manual compensation to get wrong or skip (limitations
  // INV-001, INV-002). The RPC also re-checks "no other pending checkout for
  // this event" under the same transaction as a backstop against the same
  // race this function already checked for above.
  const { data: checkoutSessionId, error: createError } = await supabase.rpc(
    "create_ticket_checkout",
    // Same generated-type gap as get_filtered_events/create_event: the SQL
    // signature has no DEFAULT on these params even though it genuinely
    // accepts null for "no occurrence"/"no promo".
    {
      p_user_id: userId,
      p_event_id: eventId,
      p_occurrence_id: occurrenceId ?? null,
      p_promo_code_id: promoCodeId,
      p_promo_code_text: promoCode ?? null,
      p_expires_at: expiresAt.toISOString(),
      p_lines: rows.map((row) => ({
        ticket_type_id: row.ticketTypeId,
        quantity: row.quantity,
        unit_price: row.unitPrice,
        discount: row.discount,
        discounted_units: row.discountedUnits,
        amount: row.amount,
      })),
    } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"],
  );

  if (createError || !checkoutSessionId) {
    logger.error(
      `create_ticket_checkout failed for event ${eventId}, user ${userId}: ${createError?.message}`,
    );
    // The RPC's own exception messages are user-safe (it never raises with
    // internal detail) — surface them instead of a generic message.
    return {
      status: 409,
      message: createError?.message || "Something went wrong!",
    };
  }

  return { status: 200, checkoutSessionId: checkoutSessionId as string };
}
