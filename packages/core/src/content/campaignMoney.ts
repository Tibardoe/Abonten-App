// Campaign money in pesewas (integers). Mirrors content_campaign_accrue
// (migration 20260916130000) and content_campaign_refundable_minor so the UI
// can project spend and refunds exactly as the database records them.

/**
 * Spend recognised for delivery: delivered sponsored impressions × cost per
 * 1,000, rounded down (never a charge for part of an impression), the whole
 * amount paid once the impression goal is delivered, never more than paid.
 */
export function deliveredSpendMinor(input: {
  paidMinor: number;
  impressions: number;
  impressionGoal: number;
  cpmMinor: number;
}): number {
  if (input.paidMinor <= 0) return 0;
  if (input.impressionGoal > 0 && input.impressions >= input.impressionGoal) {
    return input.paidMinor;
  }
  const raw = Math.floor((input.impressions * input.cpmMinor) / 1000);
  return Math.min(input.paidMinor, Math.max(0, raw));
}

export function refundableMinor(input: {
  status: string;
  paidMinor: number;
  spentMinor: number;
  refundedMinor: number;
}): number {
  if (!["rejected", "cancelled", "completed"].includes(input.status)) return 0;
  return Math.max(0, input.paidMinor - input.spentMinor - input.refundedMinor);
}

export function remainingMinor(input: {
  paidMinor: number;
  spentMinor: number;
  refundedMinor: number;
}): number {
  return Math.max(0, input.paidMinor - input.spentMinor - input.refundedMinor);
}

/** "GH₵ 50.00" from pesewas. */
export function formatMinor(minor: number, currency = "GHS"): string {
  const cedis = (Math.round(minor) / 100).toFixed(2);
  return currency === "GHS" ? `GH₵ ${cedis}` : `${currency} ${cedis}`;
}
