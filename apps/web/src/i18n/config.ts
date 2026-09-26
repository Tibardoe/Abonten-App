export const locales = ["en", "fr", "es", "de", "pt", "ak"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// The browser's IANA time zone ("Africa/Lagos"), written by LocaleProvider so
// Server Actions can count "today" and "this month" on the visitor's own
// calendar (organizer dashboard, transactions). A preference, not tracking:
// the same value every browser reports to any page's JavaScript.
export const TIME_ZONE_COOKIE_NAME = "abn_tz";

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
