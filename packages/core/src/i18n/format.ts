// Numbers and dates in the language the person chose in the app.
//
// `value.toLocaleString()` with no language formats in the DEVICE's or the
// server's language, not the app's: someone reading Abonten in French on an
// English phone saw "1,234 billets", and a page rendered on the server
// (en-US) disagreed with the browser that hydrated it. Every count and
// every clock reading shown to a person goes through these instead, with
// the app's language (web `useLocale()`, native `useLocale().locale`).
//
// Money has its own formatter (@abonten/core/formatMoney) and an event's
// start has its own too (dateFormatter, in the event's time zone).

import { intlLocale, isEnglishLike } from "./coreStrings";

const counts = new Map<string, Intl.NumberFormat>();

/** A count, grouped the way the reader's language writes numbers. */
export function formatCount(
  value: number | string | null | undefined,
  locale?: string | null,
): string {
  const tag = intlLocale(locale);
  let format = counts.get(tag);
  if (!format) {
    format = new Intl.NumberFormat(tag);
    counts.set(tag, format);
  }
  const number = typeof value === "string" ? Number(value) : (value ?? 0);
  return format.format(Number.isFinite(number) ? number : 0);
}

/**
 * A percentage the way the reader's language writes one: "7.5%" in
 * English, "7,5 %" in French and German. `value` is the percentage itself
 * (7.5), not a ratio.
 */
export function formatPercent(
  value: number | string | null | undefined,
  locale?: string | null,
  options: {
    /** Decimal places shown at most (default 0). */
    maximumFractionDigits?: number;
    /** Decimal places always shown (default 0). */
    minimumFractionDigits?: number;
    /** "exceptZero" writes +12% for a rise. */
    signDisplay?: "auto" | "exceptZero" | "always" | "never";
  } = {},
): string {
  const number = typeof value === "string" ? Number(value) : (value ?? 0);
  const minimum = options.minimumFractionDigits ?? 0;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    minimumFractionDigits: minimum,
    maximumFractionDigits: Math.max(
      options.maximumFractionDigits ?? 0,
      minimum,
    ),
    signDisplay: options.signDisplay ?? "auto",
  }).format((Number.isFinite(number) ? number : 0) / 100);
}

/**
 * A number with a fixed count of decimals, written the reader's way: a
 * rating is "4.5" in English and "4,5" in French, German, Spanish and
 * Portuguese. `value.toFixed(1)` always writes the English one.
 */
export function formatDecimal(
  value: number | string | null | undefined,
  locale?: string | null,
  fractionDigits = 1,
): string {
  const number = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number.isFinite(number) ? number : 0);
}

/** A star rating: one decimal ("4.5", "4,5"). */
export function formatRating(
  value: number | string | null | undefined,
  locale?: string | null,
): string {
  return formatDecimal(value, locale, 1);
}

// Whether this engine shortens numbers by itself ("1.2K", "1,2 k", "1,2
// Mio."). Browsers and Node do; the native app's engine may accept the
// option and print the whole number. Asked once per language.
const compactWorks = new Map<string, Intl.NumberFormat | null>();

function compactFormat(tag: string): Intl.NumberFormat | null {
  if (compactWorks.has(tag)) return compactWorks.get(tag) ?? null;
  let format: Intl.NumberFormat | null = null;
  try {
    const candidate = new Intl.NumberFormat(tag, {
      notation: "compact",
      maximumFractionDigits: 1,
    });
    // 1,234,567 shortened has at most two or three digits in it.
    const digits = candidate.format(1_234_567).replace(/\D/g, "").length;
    if (digits > 0 && digits <= 3) format = candidate;
  } catch {
    format = null;
  }
  compactWorks.set(tag, format);
  return format;
}

/**
 * A count short enough for a small label: 987, "1.2K", "15K", "1.2M" in
 * English; the reader's own decimal mark and abbreviations elsewhere
 * ("1,2 k", "1,2 Mio.").
 */
export function formatCompactCount(
  value: number | string | null | undefined,
  locale?: string | null,
): string {
  const number = typeof value === "string" ? Number(value) : (value ?? 0);
  const n = Number.isFinite(number) ? number : 0;
  if (Math.abs(n) < 1000) return formatCount(n, locale);
  // English keeps the K and M everyone knows from every other app: the
  // British data Intl has writes "1.2k" and "1.2m", and "m" reads as metres.
  const format = isEnglishLike(locale)
    ? null
    : compactFormat(intlLocale(locale));
  if (format) return format.format(n);
  const short = (amount: number, digits: number) =>
    new Intl.NumberFormat(intlLocale(locale), {
      maximumFractionDigits: digits,
    }).format(amount);
  if (Math.abs(n) < 1_000_000) {
    return `${short(n / 1000, Math.abs(n) < 10_000 ? 1 : 0)}K`;
  }
  return `${short(n / 1_000_000, 1)}M`;
}

/**
 * The size of a file: "2.3 MB", "2,3 Mo" in French. Kilobytes below one
 * megabyte, never bytes: nobody uploading a photo thinks in those.
 */
export function formatFileSize(
  bytes: number | null | undefined,
  locale?: string | null,
): string {
  const size = Number.isFinite(bytes) ? Math.max(0, bytes as number) : 0;
  const megabytes = size / (1024 * 1024);
  const inMegabytes = megabytes >= 1;
  // Something that exists is never "0 kB".
  const amount = inMegabytes
    ? megabytes
    : size === 0
      ? 0
      : Math.max(1, Math.round(size / 1024));
  const digits = inMegabytes ? 1 : 0;
  const unit = inMegabytes ? "megabyte" : "kilobyte";
  try {
    const text = new Intl.NumberFormat(intlLocale(locale), {
      style: "unit",
      unit,
      unitDisplay: "short",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
    // An engine without units prints the bare number.
    if (/[A-Za-z]/.test(text)) return text;
  } catch {
    // fall through
  }
  return `${formatDecimal(amount, locale, digits)} ${inMegabytes ? "MB" : "KB"}`;
}

const DATE_TIME: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

const DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A moment on the reader's own clock ("3 Oct 2026, 14:30"), or "" when the
 * value is not a date. Pass `options.timeZone` to read another clock.
 */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  locale?: string | null,
  options: Intl.DateTimeFormatOptions = DATE_TIME,
): string {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), options).format(date);
}

/** A calendar day on the reader's own calendar ("3 Oct 2026"), or "". */
export function formatDate(
  value: string | number | Date | null | undefined,
  locale?: string | null,
  options: Intl.DateTimeFormatOptions = DATE,
): string {
  return formatDateTime(value, locale, options);
}
