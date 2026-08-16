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
