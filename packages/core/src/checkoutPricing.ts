// Single source of truth for promo-eligibility allocation and per-line price
// math, shared by validateCheckout.ts (server, authoritative), CheckoutModal.tsx
// (client live preview), and updateTicketCheckoutQuantity.ts (server). Not a
// "use server" file — same category as ticketInventory.ts/promoUsage.ts, a
// plain module safely importable from both server actions and client
// components.

/**
 * Allocates a promo code's remaining eligible units across several ticket-type
 * lines, first-come in the order the lines are given. `remainingUses === null`
 * means unlimited (every requested unit is eligible).
 */
export function allocatePromoEligibility(
  lines: { id: string; quantity: number }[],
  remainingUses: number | null,
): Record<string, number> {
  let unitsLeft = remainingUses;
  const eligibleUnitsByLine: Record<string, number> = {};

  for (const line of lines) {
    const eligible =
      unitsLeft === null ? line.quantity : Math.min(line.quantity, unitsLeft);

    eligibleUnitsByLine[line.id] = eligible;

    if (unitsLeft !== null) {
      unitsLeft -= eligible;
    }
  }

  return eligibleUnitsByLine;
}

/**
 * Percentage-off-unit-price math for one line: discount only applies to the
 * eligible units (which may be fewer than the full quantity), and the amount
 * is floored at 0.
 */
export function computeLineAmount(
  quantity: number,
  unitPrice: number,
  discountPercentage: number,
  eligibleUnits: number,
): { discount: number; amount: number } {
  const discount = discountPercentage
    ? (discountPercentage / 100) * unitPrice * eligibleUnits
    : 0;
  const amount = Math.max(0, quantity * unitPrice - discount);

  return { discount, amount };
}

// Ticket checkout only — the customer-paid Abonten service fee, added on top
// of the (already discounted) ticket total at payment time. The whole fee is
// Abonten's; the organizer still receives 100% of the ticket price. Not
// persisted on ticket_checkout/total_price (which stays pure ticket pricing,
// shared with inventory/promo math) — computed once here so CheckoutModal.tsx's
// preview, the order summary/basket totals, and createPaymentAttempt.ts's
// charged amount can never drift apart the way they used to.
//
// The authoritative rate lives in the platform_fee_config DB table (see
// get_active_platform_fee_rate / src/utils/platformFee.ts). This constant is
// only the fallback used by the client-side live preview before the real rate
// has loaded (see src/hooks/useServiceFeeRate.ts) and by any caller that
// hasn't fetched it — every server-side charge path passes the DB rate in.
export const DEFAULT_SERVICE_FEE_RATE = 0.05;

export function computeCheckoutFee(
  amountBeforeFee: number,
  feeRate: number = DEFAULT_SERVICE_FEE_RATE,
): number {
  if (amountBeforeFee <= 0) return 0;
  // Money is 2dp everywhere it is stored (numeric(10,2)) and charged
  // (toPesewas rounds to the nearest pesewa), so the fee is rounded to 2dp
  // here too rather than being left as a raw product. A rate like 0.05 on
  // GHS 24 otherwise yields 1.2000000000000002, and any surface that renders
  // the number without its own formatter prints that float in full — the
  // mobile checkout screen showed "Service fee GHS 1.2000000000000002"
  // directly above the Pay button. The charged and stored amounts are
  // unchanged; this only removes the binary-floating-point tail.
  return Math.round(amountBeforeFee * feeRate * 100) / 100;
}
