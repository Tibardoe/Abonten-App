import { LOCALE_NAMES } from "@abonten/i18n/locales";

export const locales = ["en", "fr", "es", "de", "pt", "ak"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

// How each language names itself, for the language picker: a person who
// cannot read the current language must still find their own in the list.
// One list for the web and the app (@abonten/i18n/locales), which also says
// which languages are only partly translated.
export const localeNames: Record<Locale, string> = LOCALE_NAMES;

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// The browser's IANA time zone ("Africa/Lagos"), written by LocaleProvider so
// Server Actions can count "today" and "this month" on the visitor's own
// calendar (organizer dashboard, transactions). A preference, not tracking:
// the same value every browser reports to any page's JavaScript.
export const TIME_ZONE_COOKIE_NAME = "abn_tz";

// The zone next-intl's own formatters use on the server. Pages are rendered
// the same for every visitor (so they can be cached), and the server cannot
// know a visitor's zone without making every page dynamic; the default
// market's zone is the honest choice for a Ghana-first product. Event times
// are formatted in the EVENT's zone by @abonten/core regardless.
export const SERVER_TIME_ZONE = "Africa/Accra";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
