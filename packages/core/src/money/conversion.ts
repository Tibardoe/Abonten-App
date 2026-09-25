// Display-only currency conversion. A converted amount is an ESTIMATE for a
// person browsing in another currency; it never replaces the canonical
// price, is never charged, and is never written to a money column.
//
// Rates are stored USD-based (the exchange_rate table: one row per quote
// currency against the base), so any pair converts through the base:
//   GHS -> GBP = (1 / rate[GHS]) * rate[GBP].
// A rate older than `maxAgeMs` is still usable but flagged `stale`; older
// than `hardMaxAgeMs` it is refused, and the caller shows the canonical
// price alone. A missing rate converts to null — never to a guess.

import { type CurrencyCode, getCurrency } from "./currencies";
import { type Money, money } from "./money";

export type RateTable = {
  base: CurrencyCode;
  /** quote currency -> units of quote per 1 unit of base. */
  rates: Record<string, number>;
  /** When the provider published these rates. */
  asOf: string;
  source: string;
};

export type ConvertedMoney = {
  approx: Money;
  rate: number;
  asOf: string;
  source: string;
  stale: boolean;
};

export const RATE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const RATE_REFUSE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Units of `to` per 1 unit of `from`, or null when either side is missing. */
export function crossRate(
  table: RateTable,
  from: CurrencyCode,
  to: CurrencyCode,
): number | null {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;
  const base = table.base.toUpperCase();
  const rateOf = (code: string): number | null => {
    if (code === base) return 1;
    const r = table.rates[code];
    return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
  };
  const rf = rateOf(f);
  const rt = rateOf(t);
  if (rf == null || rt == null) return null;
  return rt / rf;
}

export function rateAgeMs(table: RateTable, now: Date = new Date()): number {
  const at = new Date(table.asOf).getTime();
  return Number.isFinite(at) ? now.getTime() - at : Number.POSITIVE_INFINITY;
}

/**
 * Converts for display. Returns null when there is no usable rate (missing
 * pair, unparseable timestamp, or older than the refuse threshold).
 */
export function convertForDisplay(
  m: Money,
  to: CurrencyCode,
  table: RateTable | null | undefined,
  options: { now?: Date; staleAfterMs?: number; refuseAfterMs?: number } = {},
): ConvertedMoney | null {
  if (!table) return null;
  const target = getCurrency(to).code;
  if (m.currency === target) {
    return {
      approx: m,
      rate: 1,
      asOf: table.asOf,
      source: table.source,
      stale: false,
    };
  }
  const age = rateAgeMs(table, options.now);
  if (age > (options.refuseAfterMs ?? RATE_REFUSE_AFTER_MS)) return null;
  const rate = crossRate(table, m.currency, target);
  if (rate == null) return null;
  const fromFactor = 10 ** getCurrency(m.currency).minorUnits;
  const toFactor = 10 ** getCurrency(target).minorUnits;
  const approxMinor = (m.amountMinor / fromFactor) * rate * toFactor;
  return {
    approx: money(approxMinor, target),
    rate,
    asOf: table.asOf,
    source: table.source,
    stale: age > (options.staleAfterMs ?? RATE_STALE_AFTER_MS),
  };
}
