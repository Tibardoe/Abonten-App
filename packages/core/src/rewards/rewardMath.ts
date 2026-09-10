// Reward amount math, shared by the engine's TypeScript callers, the admin
// console's "what would this pay?" previews and the tests. The database
// functions are the enforcement point; this mirrors their rules so a
// preview can never promise more than the engine will pay.
//
// Every amount is integer pesewas and every result is rounded DOWN to the
// pesewa -- a reward never rounds up at Abonten's expense.

export type RateRewardInput = {
  /** What the rate applies to, e.g. the referred checkout's ticket revenue. */
  basisMinor: number;
  /** Share of the basis, in basis points (1% = 100). */
  rateBps: number;
  /** Abonten's actual net revenue on that sale (service fee − processing). */
  netRevenueMinor: number;
  /** Hard cap as a share of that net revenue, in basis points. */
  netShareCapBps: number;
  /** Rewards are not paid on orders below this basis. */
  minBasisMinor?: number;
  /** Any remaining per-period / per-event cap for this beneficiary. */
  remainingCapMinor?: number | null;
  /** Campaign multiplier in basis points (15000 = 1.5x), applied before the net cap. */
  multiplierBps?: number;
};

export type RateRewardResult = {
  amountMinor: number;
  /** Which limit decided the amount, for the decision record. */
  limitedBy:
    | "rate"
    | "net_share_cap"
    | "remaining_cap"
    | "min_basis"
    | "no_net_revenue";
};

function floorNonNegative(value: number): number {
  return value > 0 ? Math.floor(value) : 0;
}

export function computeRateReward(input: RateRewardInput): RateRewardResult {
  const basis = floorNonNegative(input.basisMinor);
  if (basis < (input.minBasisMinor ?? 0) || basis === 0) {
    return { amountMinor: 0, limitedBy: "min_basis" };
  }

  const net = floorNonNegative(input.netRevenueMinor);
  if (net === 0) {
    return { amountMinor: 0, limitedBy: "no_net_revenue" };
  }

  const multiplier = input.multiplierBps ?? 10000;
  const byRate = floorNonNegative(
    (basis * input.rateBps * multiplier) / (10000 * 10000),
  );
  const byNetCap = floorNonNegative((net * input.netShareCapBps) / 10000);

  let amountMinor = byRate;
  let limitedBy: RateRewardResult["limitedBy"] = "rate";
  if (byNetCap < amountMinor) {
    amountMinor = byNetCap;
    limitedBy = "net_share_cap";
  }

  const remaining = input.remainingCapMinor;
  if (remaining !== null && remaining !== undefined) {
    const safeRemaining = floorNonNegative(remaining);
    if (safeRemaining < amountMinor) {
      amountMinor = safeRemaining;
      limitedBy = "remaining_cap";
    }
  }

  return { amountMinor, limitedBy };
}

/**
 * Pro-rata share of a reward, rounded down: used when only part of a
 * referred order survives to settlement (some tickets cancelled).
 */
export function proRataMinor(
  amountMinor: number,
  partUnits: number,
  wholeUnits: number,
): number {
  if (wholeUnits <= 0 || partUnits <= 0 || amountMinor <= 0) return 0;
  if (partUnits >= wholeUnits) return Math.floor(amountMinor);
  return Math.floor((amountMinor * partUnits) / wholeUnits);
}
