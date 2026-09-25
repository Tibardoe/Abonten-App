// Money is stored as numeric(10,2) and charged in whole minor units, so every
// surface that shows an amount should show the currency's own number of
// decimals. Screens that built the string by interpolating the raw number
// instead ("GHS 30", "GHS 25.2", "GHS 1.2000000000000002") disagreed with
// the ones that formatted it.
//
// This is the major-unit convenience over @abonten/core/money/formatMoney:
// the currency's real sign ("GH₵25.20", "₦25,000.00", "US$25.00"), never a
// guessed one, for whichever currency the row carries. A display must never
// crash, so a missing or unknown code shows the bare amount (with the code,
// when there is one) instead of throwing.

import { isKnownCurrency } from "./money/currencies";
import { formatMajor } from "./money/formatMoney";

/** `formatMoney("GHS", 25.2)` -> `"GH₵25.20"`; `formatMoney("NGN", 25000)` -> `"₦25,000.00"`. */
export function formatMoney(
  currency: string | null | undefined,
  amount: number | string | null | undefined,
  options: { trimZeroFraction?: boolean; locale?: string } = {},
): string {
  if (!currency || !isKnownCurrency(currency)) {
    const num = typeof amount === "string" ? Number(amount) : (amount ?? 0);
    const safe = Number.isFinite(num) ? num : 0;
    return `${currency ? `${currency} ` : ""}${safe.toFixed(2)}`;
  }
  return formatMajor(amount, currency, options);
}
