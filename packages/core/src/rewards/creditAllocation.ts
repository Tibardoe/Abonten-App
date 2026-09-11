// How much Abonten Credit an order can use. Shared by the checkout quote
// (what the "Use credit" switch shows) and the payment attempt (what is
// actually reserved), so the number the user agreed to is the number
// charged. The database re-checks the balance under a lock when reserving.
//
// Every amount is integer pesewas.

export type CreditAllocationInput = {
  orderTotalMinor: number;
  /** What the user may spend on this kind of order right now. */
  spendableMinor: number;
  /**
   * Paystack can't charge a few pesewas: a part-credit order must leave at
   * least this much cash, or be paid fully with credit.
   */
  minCashChargeMinor: number;
  /** Whether credit may cover the whole order (no cash charge at all). */
  allowFullCredit: boolean;
  /** Largest share of the order credit may pay, in basis points (100% = 10000). */
  maxShareBps?: number;
};

export type CreditAllocation = {
  creditMinor: number;
  cashMinor: number;
  /** True when credit covers everything and no card/wallet is charged. */
  creditOnly: boolean;
};

function wholeNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function allocateCredit(input: CreditAllocationInput): CreditAllocation {
  const total = wholeNonNegative(input.orderTotalMinor);
  const spendable = wholeNonNegative(input.spendableMinor);
  const minCash = wholeNonNegative(input.minCashChargeMinor);
  const maxShare = Math.min(
    10000,
    wholeNonNegative(input.maxShareBps ?? 10000),
  );

  if (total === 0 || spendable === 0) {
    return { creditMinor: 0, cashMinor: total, creditOnly: false };
  }

  const byShare = Math.floor((total * maxShare) / 10000);

  if (input.allowFullCredit && maxShare === 10000 && spendable >= total) {
    return { creditMinor: total, cashMinor: 0, creditOnly: true };
  }

  // Part credit, part cash: leave at least the minimum cash charge.
  const credit = Math.max(0, Math.min(spendable, byShare, total - minCash));
  return { creditMinor: credit, cashMinor: total - credit, creditOnly: false };
}

/**
 * Spreads an order's credit over its parts (the checkout sessions paid
 * together in one ticket payment) in proportion to each part's total, so
 * every payment_attempt row records its own cash and credit. Pro rata,
 * rounded down; the rounding goes to the largest part. Never gives a part
 * more credit than its own total.
 */
export function apportionCredit(
  creditMinor: number,
  partTotalsMinor: number[],
): number[] {
  const credit = wholeNonNegative(creditMinor);
  const totals = partTotalsMinor.map(wholeNonNegative);
  const sum = totals.reduce((a, b) => a + b, 0);
  if (credit === 0 || sum === 0) return totals.map(() => 0);

  const capped = Math.min(credit, sum);
  const shares = totals.map((t) => Math.floor((capped * t) / sum));
  let left = capped - shares.reduce((a, b) => a + b, 0);

  // Hand the leftover pesewas to the largest parts first, within their room.
  const order = totals
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t - a.t || a.i - b.i);
  while (left > 0) {
    let moved = false;
    for (const { i } of order) {
      if (left === 0) break;
      if (shares[i] < totals[i]) {
        shares[i] += 1;
        left -= 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return shares;
}
