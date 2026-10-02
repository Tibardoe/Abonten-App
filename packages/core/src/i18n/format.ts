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

import { intlLocale } from "./coreStrings";

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
