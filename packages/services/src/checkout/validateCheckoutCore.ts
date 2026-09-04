import { randomUUID } from "node:crypto";
import { getCheckoutExpiryTimestamp } from "@abonten/core/checkoutExpiry";
import { validateCheckoutQuantities } from "@abonten/core/checkoutLimits";
import {
  allocatePromoEligibility,
  computeLineAmount,
} from "@abonten/core/checkoutPricing";
import { resolveEventEndDate } from "@abonten/core/dateFormatter";
import { logger } from "@abonten/core/logger";
import {
  claimPromoUsage,
  releasePromoUsage,
} from "@abonten/services/checkout/promoUsage";
import {
  releaseTicketQuantity,
  reserveTicketQuantity,
} from "@abonten/services/checkout/ticketInventory";
import { getPromoCodeCore } from "@abonten/services/promo-codes/getPromoCodeCore";
import type { SupabaseClient } from "@supabase/supabase-js";

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

type TicketWithEvent = {
  user_id: string;
  ticket_type_id: {
    event_id: string;
  };
  status: string;
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
  reason?: "pending_checkout" | "already_purchased";
  checkoutId?: string;
};

export async function validateCheckoutCore(
  supabase: SupabaseClient,
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

  // Check if user has already bought ticket for the event
  const { data: rawTicketData, error: ticketDataError } = await supabase
    .from("ticket")
    .select("user_id, ticket_type_id(event_id), status")
    .eq("user_id", userId);

  if (ticketDataError || !rawTicketData) {
    logger.error(`Error fetching ticket data: ${ticketDataError?.message}`);

    return { status: 500, message: "Something went wrong" };
  }

  const ticketData = rawTicketData as unknown as TicketWithEvent[];

  const alreadyBought = ticketData?.some(
    (ticket) =>
      ticket.ticket_type_id.event_id === eventId &&
      (ticket.status === "active" || ticket.status === "used"),
  );

  if (alreadyBought) {
    return {
      status: 300,
      reason: "already_purchased" as const,
      message: "Ticket for this event already bought",
    };
  }

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

  let promoCodeId: string | null = null;
  let discountPercentage = 0;
  const requestedLines = Object.entries(quantities)
    .filter(([, value]) => value > 0)
    .map(([ticketTypeId, quantity]) => ({ id: ticketTypeId, quantity }));

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

  // Reserve inventory for every requested ticket type up front (this is the
  // "checkout begins" reservation — Option B from the checkout redesign:
  // holding the units now, and releasing them on expiry/cancellation, avoids
  // telling a buyer their checkout is valid only to find the ticket gone at
  // payment time). Each reservation uses the same atomic compare-and-swap
  // as reserveTicketQuantity always has; if any later item in this request
  // fails, everything reserved so far in THIS request is rolled back.
  const reserved: { ticketTypeId: string; quantity: number }[] = [];
  const rows: {
    ticketTypeId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    discountedUnits: number;
    amount: number;
  }[] = [];

  const rollbackReservations = async () => {
    for (const item of reserved) {
      await releaseTicketQuantity(item.ticketTypeId, item.quantity);
    }
  };

  for (const [ticketTypeId, quantity] of Object.entries(quantities).filter(
    ([_id, value]) => value > 0,
  )) {
    const { data: ticketType, error: ticketError } = await supabase
      .from("ticket_type")
      .select("*")
      .eq("id", ticketTypeId)
      .maybeSingle();

    if (ticketError || !ticketType) {
      await rollbackReservations();
      return {
        status: 404,
        message: `Ticket of type ${ticketTypeId} not found`,
      };
    }

    const reservation = await reserveTicketQuantity(ticketTypeId, quantity);

    if (reservation.status !== 200) {
      await rollbackReservations();
      return {
        status: reservation.status,
        message: reservation.message ?? "That ticket is no longer available.",
      };
    }

    reserved.push({ ticketTypeId, quantity });

    const unitPrice = ticketType.price;
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

  if (rows.length === 0) {
    await rollbackReservations();
    return { status: 404, message: "Please select at least one ticket." };
  }

  const totalDiscountedUnits = rows.reduce(
    (sum, row) => sum + row.discountedUnits,
    0,
  );

  if (promoCodeId && totalDiscountedUnits > 0) {
    const claim = await claimPromoUsage(
      promoCodeId,
      userId,
      eventId,
      totalDiscountedUnits,
      supabase,
    );

    if (claim.status !== 200) {
      await rollbackReservations();
      return {
        status: claim.status,
        message: claim.message ?? "That promo code couldn't be applied.",
      };
    }
  }

  const checkoutSessionId = randomUUID();
  const expiresAt = getCheckoutExpiryTimestamp();

  const { error: checkoutInsertError } = await supabase
    .from("ticket_checkout")
    .insert(
      rows.map((row) => ({
        checkout_session_id: checkoutSessionId,
        user_id: userId,
        event_id: eventId,
        ticket_type_id: row.ticketTypeId,
        quantity: row.quantity,
        unit_price: row.unitPrice,
        promo_code: promoCode ?? null,
        discount: row.discount,
        discounted_units: row.discountedUnits,
        total_price: row.amount,
        status: "pending",
        expires_at: expiresAt,
        occurrence_id: occurrenceId ?? null,
      })),
    );

  if (checkoutInsertError) {
    logger.error(`Failed to insert checkout: ${checkoutInsertError.message}`);

    await rollbackReservations();
    if (promoCodeId && totalDiscountedUnits > 0) {
      await releasePromoUsage(
        promoCodeId,
        userId,
        eventId,
        totalDiscountedUnits,
        supabase,
      );
    }

    return {
      status: 500,
      message: "Something went wrong!",
    };
  }

  return { status: 200, checkoutSessionId };
}
