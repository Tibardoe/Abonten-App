// The money model: an integer count of a currency's smallest unit plus the
// currency code. Every calculation the platform performs on money — fees,
// discounts, refund splits, commission, credit — goes through these
// functions, so there is exactly one rounding rule and no floating-point
// arithmetic on amounts that will be charged or paid out.
//
// Boundaries:
//   * People type and the database's numeric columns store MAJOR amounts
//     ("12.40"). `fromMajor` / `toMajor` / `toMajorString` convert at the
//     edge using the currency's ISO exponent, exactly.
//   * Payment providers count in MINOR units (pesewas, kobo, pence). The
//     provider adapters take `amountMinor` directly.
//
// Rounding is half away from zero (12.345 -> 12.35, -12.345 -> -12.35) — the
// rule the database uses (Postgres `round(numeric, 2)`), so a fee worked out
// here matches one worked out in SQL. `Math.round` is not used because it
// rounds negative halves towards +∞.

import {
  type CurrencyCode,
  currencyMinorFactor,
  currencyMinorUnits,
  getCurrency,
} from "./currencies";

export type Money = {
  /** Integer count of the currency's smallest unit. Never fractional. */
  amountMinor: number;
  currency: CurrencyCode;
};

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Currency mismatch: ${a} vs ${b}`);
    this.name = "CurrencyMismatchError";
  }
}

/** Half away from zero, to an integer. */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  // A tiny epsilon absorbs binary representation error (1.2000000000000002,
  // 2.4999999999999996) so a value that is "really" a half rounds as a half.
  return sign * Math.floor(Math.abs(value) + 0.5 + 1e-9);
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isFinite(amountMinor)) {
    throw new Error(`Invalid minor amount: ${amountMinor}`);
  }
  return {
    amountMinor: roundHalfAwayFromZero(amountMinor),
    currency: getCurrency(currency).code,
  };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

/**
 * From a major-unit amount (a typed price, a numeric column). Strings are
 * parsed as decimals so "12.40" never passes through a float; numbers are
 * scaled then rounded half away from zero to the currency's exponent.
 */
export function fromMajor(
  major: number | string,
  currency: CurrencyCode,
): Money {
  const code = getCurrency(currency).code;
  const exponent = currencyMinorUnits(code);
  if (typeof major === "string") {
    const parsed = parseDecimalToMinor(major, exponent);
    if (parsed == null) throw new Error(`Invalid amount: "${major}"`);
    return { amountMinor: parsed, currency: code };
  }
  if (!Number.isFinite(major)) throw new Error(`Invalid amount: ${major}`);
  return {
    amountMinor: roundHalfAwayFromZero(major * 10 ** exponent),
    currency: code,
  };
}

/** Like fromMajor but returns null instead of throwing on bad input. */
export function tryFromMajor(
  major: unknown,
  currency: CurrencyCode,
): Money | null {
  try {
    if (typeof major === "number" || typeof major === "string") {
      return fromMajor(major, currency);
    }
    return null;
  } catch {
    return null;
  }
}

/** Exact decimal string → integer minor units, or null if malformed. */
function parseDecimalToMinor(input: string, exponent: number): number | null {
  const text = input.trim().replace(/,/g, "");
  const m = /^([+-])?(\d+)(?:\.(\d*))?$/.exec(text);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const whole = m[2];
  const frac = (m[3] ?? "").padEnd(exponent, "0");
  const kept = frac.slice(0, exponent);
  const dropped = frac.slice(exponent);
  let minor = Number(whole) * 10 ** exponent + Number(kept || "0");
  // Round half away from zero on the dropped digits.
  if (dropped.length > 0 && Number(dropped[0]) >= 5) minor += 1;
  if (!Number.isSafeInteger(minor)) return null;
  return sign * minor;
}

/** Major-unit number, for arithmetic-free display or numeric columns. */
export function toMajor(m: Money): number {
  return m.amountMinor / currencyMinorFactor(m.currency);
}

/**
 * Exact major-unit string with the currency's number of decimals ("12.40",
 * "1500", "1.250"). This is what to write into a numeric column or send to a
 * provider that takes decimals — it never carries a float tail.
 */
export function toMajorString(m: Money): string {
  const exponent = currencyMinorUnits(m.currency);
  const abs = Math.abs(m.amountMinor);
  const factor = 10 ** exponent;
  const whole = Math.floor(abs / factor);
  const frac = abs % factor;
  const sign = m.amountMinor < 0 ? "-" : "";
  if (exponent === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${String(frac).padStart(exponent, "0")}`;
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function negate(m: Money): Money {
  return { amountMinor: -m.amountMinor, currency: m.currency };
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, item) => add(acc, item), zero(currency));
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0;
}

export function isNegative(m: Money): boolean {
  return m.amountMinor < 0;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

export function min(a: Money, b: Money): Money {
  return compare(a, b) <= 0 ? a : b;
}

export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b;
}

/** Clamp at zero: a refund or discount can never go negative. */
export function floorAtZero(m: Money): Money {
  return m.amountMinor < 0 ? zero(m.currency) : m;
}

/** Multiply by a plain factor (quantity, a rate such as 0.05), rounded once. */
export function multiply(m: Money, factor: number): Money {
  if (!Number.isFinite(factor)) throw new Error(`Invalid factor: ${factor}`);
  return money(m.amountMinor * factor, m.currency);
}

/** Basis points: percentageBps(m, 500) is 5% of m, rounded once. */
export function percentageBps(m: Money, bps: number): Money {
  if (!Number.isInteger(bps)) throw new Error(`Invalid bps: ${bps}`);
  return money((m.amountMinor * bps) / 10_000, m.currency);
}

/** A percentage given as a decimal rate (0.05 = 5%), rounded once. */
export function percentage(m: Money, rate: number): Money {
  return multiply(m, rate);
}

/**
 * Splits `m` across `weights` proportionally without losing or inventing a
 * minor unit: the shares are floored, then the remainder is handed out one
 * unit at a time to the shares with the largest fractional parts (largest
 * remainder method). The result always sums to `m` exactly. Used for refund
 * splits (cash vs credit), multi-checkout fee attribution and commission.
 * All-zero weights split evenly by count.
 */
export function allocate(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) return [];
  const safe = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const totalWeight = safe.reduce((s, w) => s + w, 0);
  const effective = totalWeight === 0 ? safe.map(() => 1) : safe;
  const effectiveTotal = totalWeight === 0 ? safe.length : totalWeight;

  const sign = m.amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(m.amountMinor);
  const raw = effective.map((w) => (abs * w) / effectiveTotal);
  const floored = raw.map((r) => Math.floor(r + 1e-9));
  let remainder = abs - floored.reduce((s, v) => s + v, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r + 1e-9) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }

  return floored.map((v) => ({ amountMinor: sign * v, currency: m.currency }));
}

/**
 * The share of `part` in `whole` as a proportion (0..1), for pro-rata rules
 * that need a ratio rather than a split. 0 when the whole is zero.
 */
export function ratio(part: Money, whole: Money): number {
  assertSameCurrency(part, whole);
  if (whole.amountMinor === 0) return 0;
  return part.amountMinor / whole.amountMinor;
}

/** JSON-safe, for API envelopes: `{ amountMinor, currency }` as-is. */
export function isMoney(value: unknown): value is Money {
  return (
    !!value &&
    typeof value === "object" &&
    Number.isInteger((value as Money).amountMinor) &&
    typeof (value as Money).currency === "string"
  );
}
