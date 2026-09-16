// Campaign money in pesewas (integers). Mirrors content_campaign_accrue and
// content_campaign_refundable_minor so the UI can project spend and refunds
// exactly as the database will record them.

export function projectedSpentMinor(input: {
  paidMinor: number;
  activeSeconds: number;
  durationDays: number;
}): number {
  const durationSeconds = input.durationDays * 86_400;
  if (durationSeconds <= 0 || input.paidMinor <= 0) return 0;
  const raw = Math.round(
    (input.paidMinor * input.activeSeconds) / durationSeconds,
  );
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
