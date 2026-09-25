import {
  currencyMinorFactor,
  isKnownCurrency,
} from "@abonten/core/money/currencies";

// Minor units (what the ledgers store) <-> major units (what an admin
// reads and types) for a figure's own currency: 100 for GH₵ or ₦, 1 for a
// zero-decimal currency such as CFA francs. An unknown or missing code
// falls back to 100, the factor of every currency Abonten runs today.
const factor = (currency: string | null | undefined): number =>
  currency && isKnownCurrency(currency) ? currencyMinorFactor(currency) : 100;

export function minorToMajor(
  minor: number,
  currency: string | null | undefined,
): number {
  return minor / factor(currency);
}

export function majorToMinor(
  major: number,
  currency: string | null | undefined,
): number {
  return Math.round(major * factor(currency));
}

/** "12.50" for a form field, "" for null. */
export function minorToInput(
  minor: number | null,
  currency: string | null | undefined,
): string {
  if (minor === null) return "";
  const f = factor(currency);
  return (minor / f).toFixed(f === 1 ? 0 : String(f).length - 1);
}
