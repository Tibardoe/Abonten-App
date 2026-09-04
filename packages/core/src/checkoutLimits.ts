// Hard ceilings on how many ticket units a single checkout may request.
//
// Enforced in @abonten/services/checkout/validateCheckoutCore (the one shared
// choke point both the web Server Action and the mobile /api/mobile/checkout
// route go through), BEFORE any inventory reservation. Without this a single
// authenticated request could reserve — and then make generateTicket loop
// through — an unbounded number of units against an unlimited ticket type,
// blowing up Cloudinary/compute cost and timing out the checkout path
// (limitation DOS-001).
//
// These are deliberately generous safety ceilings, not a product policy on
// group-buying limits. If a real per-order cap is wanted it belongs in the
// event/ticket-type config, not here — see docs/audit/01-limitations-register.md
// (DOS-001, BIZ-001).

/** Max units of one ticket type in a single checkout. */
export const MAX_TICKETS_PER_TICKET_TYPE = 50;

/** Max units summed across every ticket type in a single checkout. */
export const MAX_TICKETS_PER_ORDER = 100;

export type CheckoutQuantityError =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Validates a `{ [ticketTypeId]: quantity }` map against the ceilings above.
 * Quantities must already be non-negative integers (the transport layer
 * checks that); this only enforces the upper bounds and that at least one
 * unit was requested.
 */
export function validateCheckoutQuantities(quantities: {
  [ticketTypeId: string]: number;
}): CheckoutQuantityError {
  let total = 0;

  for (const [ticketTypeId, quantity] of Object.entries(quantities)) {
    if (quantity <= 0) continue;

    if (quantity > MAX_TICKETS_PER_TICKET_TYPE) {
      return {
        ok: false,
        message: `You can buy at most ${MAX_TICKETS_PER_TICKET_TYPE} of the same ticket type in one order.`,
      };
    }

    total += quantity;
  }

  if (total === 0) {
    return { ok: false, message: "Please select at least one ticket." };
  }

  if (total > MAX_TICKETS_PER_ORDER) {
    return {
      ok: false,
      message: `You can buy at most ${MAX_TICKETS_PER_ORDER} tickets in one order.`,
    };
  }

  return { ok: true };
}
