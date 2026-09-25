// The one money formatter for every surface (web, app, admin, email).
//
//   formatMoney({ amountMinor: 5000, currency: "GHS" })          -> "GH₵50.00"
//   formatMoney(m, { trimZeroFraction: true })                    -> "GH₵50"
//   formatMoney(m, { display: "code" })                           -> "GHS 50.00"
//   formatMoney({ amountMinor: 2500000, currency: "NGN" })        -> "₦25,000.00"
//   formatMoney(usd25, { viewerCurrency: "CAD" })                 -> "US$25.00"
//
// Digits and grouping come from Intl for the locale (so a French viewer sees
// "25 000,00"); the sign comes from our currency table (see currencies.ts
// for why). Symbols are never guessed from the code.

import {
  type CurrencyCode,
  currencyMinorUnits,
  findCurrency,
  getCurrency,
} from "./currencies";
import type { Money } from "./money";

export type FormatMoneyOptions = {
  /** BCP 47 locale for digit grouping and the decimal separator. */
  locale?: string;
  /** "symbol" (default): "GH₵50.00". "code": "GHS 50.00". */
  display?: "symbol" | "code";
  /** Drop ".00" when the amount is whole: "GH₵50". Cards and chips. */
  trimZeroFraction?: boolean;
  /** Always show "+"/"−" (ledgers). */
  signDisplay?: "auto" | "always";
  /**
   * The currency the viewer thinks in. When the amount's currency has an
   * ambiguous sign ($) and differs from this, the code is prefixed: "US$25".
   */
  viewerCurrency?: CurrencyCode | null;
};

const DEFAULT_LOCALE = "en-GB";

type Separators = { group: string; decimal: string };
const separatorCache = new Map<string, Separators>();
const integerFormatterCache = new Map<string, Intl.NumberFormat>();

function separatorsFor(locale: string): Separators {
  const cached = separatorCache.get(locale);
  if (cached) return cached;
  let group = ",";
  let decimal = ".";
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234567.8);
    for (const p of parts) {
      if (p.type === "group") group = p.value;
      if (p.type === "decimal") decimal = p.value;
    }
  } catch {
    // Older Intl (or a locale the runtime lacks): keep "," and ".".
  }
  const out = { group, decimal };
  separatorCache.set(locale, out);
  return out;
}

function integerFormatter(locale: string): Intl.NumberFormat {
  const cached = integerFormatterCache.get(locale);
  if (cached) return cached;
  let f: Intl.NumberFormat;
  try {
    f = new Intl.NumberFormat(locale, {
      useGrouping: true,
      maximumFractionDigits: 0,
    });
  } catch {
    f = new Intl.NumberFormat(DEFAULT_LOCALE, {
      useGrouping: true,
      maximumFractionDigits: 0,
    });
  }
  integerFormatterCache.set(locale, f);
  return f;
}

/** "50.00" / "25,000.00" / "1 500" — digits only, no sign or symbol. */
export function formatMinorDigits(
  amountMinor: number,
  currency: CurrencyCode,
  options: Pick<FormatMoneyOptions, "locale" | "trimZeroFraction"> = {},
): string {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const exponent = currencyMinorUnits(currency);
  const factor = 10 ** exponent;
  const abs = Math.abs(Math.round(amountMinor));
  const whole = Math.floor(abs / factor);
  const frac = abs % factor;
  const wholeText = integerFormatter(locale).format(whole);
  if (exponent === 0 || (options.trimZeroFraction && frac === 0)) {
    return wholeText;
  }
  const { decimal } = separatorsFor(locale);
  return `${wholeText}${decimal}${String(frac).padStart(exponent, "0")}`;
}

export function formatMoney(
  m: Money,
  options: FormatMoneyOptions = {},
): string {
  const currency = getCurrency(m.currency);
  const safeMinor = Number.isFinite(m.amountMinor) ? m.amountMinor : 0;
  const digits = formatMinorDigits(safeMinor, currency.code, options);
  const negative = safeMinor < 0;
  const sign = negative
    ? "−"
    : options.signDisplay === "always" && safeMinor > 0
      ? "+"
      : "";

  if (options.display === "code") {
    return `${sign}${currency.code} ${digits}`;
  }

  const viewer = options.viewerCurrency
    ? findCurrency(options.viewerCurrency)
    : null;
  const disambiguate =
    currency.symbolIsAmbiguous &&
    viewer != null &&
    viewer.code !== currency.code &&
    (viewer.symbol === currency.symbol || viewer.symbolIsAmbiguous);
  const symbol = disambiguate
    ? `${currency.code.slice(0, 2)}${currency.symbol}`
    : currency.symbol;
  // Multi-letter signs ("KSh", "CFA") read better with a thin space before
  // the digits; single glyphs ("£", "₦") and the cedi sign do not.
  const spacer =
    /^[A-Za-z]{2,}$|^[A-Za-z]+\.?$/.test(symbol) && symbol.length > 1
      ? " "
      : "";
  return `${sign}${symbol}${spacer}${digits}`;
}

/** Convenience for a major-unit number from a numeric column. */
export function formatMajor(
  major: number | string | null | undefined,
  currency: CurrencyCode,
  options: FormatMoneyOptions = {},
): string {
  const exponent = currencyMinorUnits(currency);
  const num = typeof major === "string" ? Number(major) : (major ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  const minor = Math.round(safe * 10 ** exponent);
  return formatMoney({ amountMinor: minor, currency }, options);
}

/** "GH₵" / "₦" / "£" for input adornments. */
export function currencySymbol(currency: CurrencyCode): string {
  return getCurrency(currency).symbol;
}
