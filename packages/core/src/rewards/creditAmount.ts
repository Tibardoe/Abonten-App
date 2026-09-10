// Abonten Credit is stored as integer pesewas (bigint `*_minor` columns in
// the credit ledger) because rate-based rewards produce fractions of a
// pesewa. Everything else in the app works in cedis with 2 decimals, so the
// conversion happens only here, at the service boundary.

export const CREDIT_CURRENCY = "GHS";

/** Pesewas -> cedis. 1240 -> 12.4 */
export function creditMinorToCedis(minor: number): number {
  return Math.round(minor) / 100;
}

/** Cedis -> pesewas, rounded to the nearest pesewa. 12.4 -> 1240 */
export function cedisToCreditMinor(cedis: number): number {
  return Math.round(cedis * 100);
}

/**
 * `formatCredit(1240)` -> "GH₵ 12.40", `formatCredit(-200)` -> "−GH₵ 2.00".
 * The cedi sign is what Ghanaian users recognise; `formatMoney` (which shows
 * the ISO code) stays the format for real payments.
 */
export function formatCredit(minor: number): string {
  const safe = Number.isFinite(minor) ? Math.round(minor) : 0;
  const cedis = (Math.abs(safe) / 100).toFixed(2);
  return `${safe < 0 ? "−" : ""}GH₵ ${cedis}`;
}

/** Like formatCredit but always shows the sign: "+GH₵ 3.00" / "−GH₵ 3.00". */
export function formatCreditDelta(minor: number): string {
  const safe = Number.isFinite(minor) ? Math.round(minor) : 0;
  if (safe === 0) return formatCredit(0);
  return `${safe > 0 ? "+" : "−"}${formatCredit(Math.abs(safe))}`;
}
