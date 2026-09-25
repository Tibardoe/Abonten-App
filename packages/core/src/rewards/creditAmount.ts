// Abonten Credit is stored as integer minor units (bigint `*_minor` columns
// in the credit ledger) because rate-based rewards produce fractions of a
// minor unit. Each person's credit is in one currency — their home market's
// — which the ledger rows and the summary carry; nothing here assumes which.
// Everything else in the app works in major units with the currency's own
// decimals, so the conversion happens only here, at the service boundary.

import { currencyMinorFactor, isKnownCurrency } from "../money/currencies";
import { formatMoney } from "../money/formatMoney";

/** Minor units -> major units for `currency`. 1240 GHS -> 12.4 */
export function creditMinorToMajor(minor: number, currency: string): number {
  return Math.round(minor) / currencyMinorFactor(currency);
}

/** Major units -> minor units, rounded to the nearest minor unit. 12.4 -> 1240 */
export function majorToCreditMinor(major: number, currency: string): number {
  return Math.round(major * currencyMinorFactor(currency));
}

/**
 * `formatCredit(1240, "GHS")` -> "GH₵12.40", `formatCredit(-200, "NGN")` -> "−₦2.00".
 * The currency's own sign is what people recognise; the same formatter
 * real payments use, so a credit line and a cash line never disagree.
 */
export function formatCredit(minor: number, currency: string): string {
  const safe = Number.isFinite(minor) ? Math.round(minor) : 0;
  // Copy must never crash a screen: an unknown code shows the bare amount.
  if (!isKnownCurrency(currency)) return (safe / 100).toFixed(2);
  return formatMoney({ amountMinor: safe, currency });
}

/** Like formatCredit but always shows the sign: "+GH₵3.00" / "−GH₵3.00". */
export function formatCreditDelta(minor: number, currency: string): string {
  const safe = Number.isFinite(minor) ? Math.round(minor) : 0;
  if (!isKnownCurrency(currency))
    return `${safe > 0 ? "+" : safe < 0 ? "−" : ""}${(Math.abs(safe) / 100).toFixed(2)}`;
  return formatMoney(
    { amountMinor: safe, currency },
    { signDisplay: "always" },
  );
}
