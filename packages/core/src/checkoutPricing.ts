import { isKnownCurrency } from "./money/currencies";
import {
  fromMajor,
  money,
  roundHalfAwayFromZero,
  toMajor,
} from "./money/money";

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
 *
 * Worked in the currency's integer minor units and rounded once (half away
 * from zero) to what that currency can actually hold — whole yen or francs,
 * pesewas, thousandths of a dinar — so the preview, the stored checkout row
 * and the charged amount agree. Floating-point percentages of major units
 * used to leave values like 33.333 for a stored numeric column to round.
 */
export function computeLineAmount(
  quantity: number,
  unitPrice: number,
  discountPercentage: number,
  eligibleUnits: number,
  currency: string,
): { discount: number; amount: number } {
  const unitMinor = fromMajor(unitPrice, currency).amountMinor;
  const discountMinor = discountPercentage
    ? roundHalfAwayFromZero(
        (unitMinor * eligibleUnits * discountPercentage) / 100,
      )
    : 0;
  const amountMinor = Math.max(0, unitMinor * quantity - discountMinor);

  return {
    discount: toMajor(money(discountMinor, currency)),
    amount: toMajor(money(amountMinor, currency)),
  };
}

// ── Group tickets and group prices ────────────────────────────────────
// docs/architecture/group-tickets-and-prices.md. A ticket type may admit
// several people per purchase (a Couple type: 2); every stored count is a
// count of people (tickets), and a line is a whole number of purchases at
// the type's price. An event may offer automatic group prices by the number
// of tickets in one order. A promo code and a group price never add up:
// each ticket gets the larger of the two.

/** An event's automatic group price: orders of at least `minTickets`. */
export type GroupDiscountTier = { minTickets: number; percentOff: number };

/** The best group price an order of `tickets` tickets reaches (0 = none). */
export function groupDiscountPercentFor(
  tiers: readonly GroupDiscountTier[] | null | undefined,
  tickets: number,
): number {
  let best = 0;
  for (const tier of tiers ?? []) {
    if (tickets >= tier.minTickets && tier.percentOff > best) {
      best = tier.percentOff;
    }
  }
  return best;
}

/** Whole purchases a stock of `peopleLeft` places still allows. */
export function purchasesLeft(
  peopleLeft: number | null | undefined,
  admits: number | null | undefined,
): number | null {
  if (peopleLeft === null || peopleLeft === undefined) return null;
  return Math.floor(Math.max(0, peopleLeft) / Math.max(1, admits ?? 1));
}

export type OrderLineInput = {
  /** The ticket type. */
  id: string;
  /** What the buyer picked: purchases of this type. */
  purchases: number;
  /** People one purchase lets in (1 for an ordinary ticket). */
  admits?: number | null;
  /** The price of one purchase, in major units. */
  unitPrice: number;
  currency: string;
  /**
   * An open-amount type (@abonten/core/openAmountTickets): the buyer chose
   * `chosenAmount`. The line is one ticket at that amount, never discounted
   * and not counted for a group price. The caller has checked the amount.
   */
  amountMode?: "fixed" | "open" | null;
  chosenAmount?: number | null;
};

export type PricedOrderLine = {
  id: string;
  purchases: number;
  admits: number;
  /** Tickets on the line: purchases × admits. */
  quantity: number;
  unitPrice: number;
  discount: number;
  /** Tickets the promo code discounted (it never discounts the others). */
  discountedUnits: number;
  /** The group price applied to this line, or null. */
  groupDiscountPercent: number | null;
  amount: number;
  /** The buyer chose the amount: one ticket, `unitPrice` = `amount`. */
  openAmount: boolean;
};

export type PricedOrder = {
  lines: PricedOrderLine[];
  /** Tickets in the whole order. */
  tickets: number;
  /**
   * Tickets a group price counts and a promo code may discount: every
   * ticket but the ones whose amount the buyer chose.
   */
  discountableTickets: number;
  /** The group price the order reached (0 = none). */
  groupDiscountPercent: number;
  /** The promo code discounts at least one ticket. */
  promoApplied: boolean;
};

/**
 * Prices a whole order: the one rule for the server (validateCheckoutCore,
 * the basket, Pay small small) and every live preview, so they agree to the
 * pesewa. `promo` is the code's percentage and how many tickets it may
 * still discount (null = unlimited). The group price comes from the number
 * of tickets in the order; when it is at least as good as the code, the
 * code is not used at all (so it is not spent).
 */
export function priceOrder(
  lines: readonly OrderLineInput[],
  options: {
    promo?: { percent: number; remainingUses: number | null } | null;
    groupTiers?: readonly GroupDiscountTier[] | null;
  } = {},
): PricedOrder {
  const sized = lines.map((line) => {
    // An amount the buyer chose: one ticket at that amount.
    if (line.amountMode === "open") {
      const purchases = line.purchases > 0 ? 1 : 0;
      return {
        ...line,
        purchases,
        admits: 1,
        quantity: purchases,
        unitPrice: line.chosenAmount ?? line.unitPrice,
        open: true,
      };
    }
    const admits = Math.max(1, Math.floor(line.admits ?? 1));
    return { ...line, admits, quantity: line.purchases * admits, open: false };
  });
  const tickets = sized.reduce((sum, line) => sum + line.quantity, 0);
  // Promo codes and group prices never touch an amount the buyer chose,
  // and those tickets do not count towards a group price.
  const discountableTickets = sized.reduce(
    (sum, line) => sum + (line.open ? 0 : line.quantity),
    0,
  );
  const groupPercent = groupDiscountPercentFor(
    options.groupTiers,
    discountableTickets,
  );
  const promo = options.promo ?? null;
  const promoPercent =
    promo && promo.percent > groupPercent ? promo.percent : 0;
  const eligibleByLine =
    promoPercent > 0
      ? allocatePromoEligibility(
          sized
            .filter((line) => !line.open)
            .map((line) => ({ id: line.id, quantity: line.quantity })),
          promo?.remainingUses ?? null,
        )
      : {};

  const priced = sized.map((line): PricedOrderLine => {
    if (line.open) {
      const amount = toMajor(fromMajor(line.unitPrice, line.currency));
      return {
        id: line.id,
        purchases: line.purchases,
        admits: 1,
        quantity: line.quantity,
        unitPrice: amount,
        discount: 0,
        discountedUnits: 0,
        groupDiscountPercent: null,
        amount: line.purchases > 0 ? amount : 0,
        openAmount: true,
      };
    }
    const unitMinor = fromMajor(line.unitPrice, line.currency).amountMinor;
    const eligible = promoPercent > 0 ? (eligibleByLine[line.id] ?? 0) : 0;
    const groupTickets = groupPercent > 0 ? line.quantity - eligible : 0;
    // Per ticket the price is unitMinor / admits; rounded once per line.
    const percentTickets =
      eligible * promoPercent + groupTickets * groupPercent;
    const discountMinor = percentTickets
      ? roundHalfAwayFromZero(
          (unitMinor * percentTickets) / (100 * line.admits),
        )
      : 0;
    const amountMinor = Math.max(0, unitMinor * line.purchases - discountMinor);
    return {
      id: line.id,
      purchases: line.purchases,
      admits: line.admits,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: toMajor(money(discountMinor, line.currency)),
      discountedUnits: eligible,
      groupDiscountPercent: groupTickets > 0 ? groupPercent : null,
      amount: toMajor(money(amountMinor, line.currency)),
      openAmount: false,
    };
  });

  return {
    lines: priced,
    tickets,
    discountableTickets,
    groupDiscountPercent: groupPercent,
    promoApplied: priced.some((line) => line.discountedUnits > 0),
  };
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
  currency?: string | null,
): number {
  if (amountBeforeFee <= 0) return 0;
  // With the order's currency, rounded to what that currency can hold
  // (whole francs or yen, thousandths of a dinar), the way the server
  // prices it; without one, the historical 2 decimals.
  if (currency && isKnownCurrency(currency)) {
    const base = fromMajor(amountBeforeFee, currency);
    return toMajor(money(base.amountMinor * feeRate, currency));
  }
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
