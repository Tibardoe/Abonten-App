// The country list for phone sign-in and the other country pickers: every
// ISO 3166-1 country (from ./geo/countries), in the shape the pickers were
// built around. Order it with `phoneCountries(liveMarketCodes)` so the open
// markets come first and the rest follow alphabetically — no market is the
// default here; the market context decides that.
//
// This is the single source of truth: apps/web/src/data/countryDetails.ts
// re-exports it, and the mobile auth country picker consumes it directly.

import {
  COUNTRIES,
  countryName,
  findCountry,
  foldForSearch,
  prioritiseCountries,
} from "./geo/countries";
import { COUNTRY_DEFAULTS } from "./geo/countryDefaults";

export type Country = {
  /** In the reader's language when the list was built with one. */
  name: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  /** E.164 dial prefix, incl. the leading "+". */
  callingCode: string;
  /** ISO 4217 of the country's usual currency, "" when not curated. */
  currency: string;
  /** Unicode flag emoji. */
  flag: string;
};

function toCountry(
  c: (typeof COUNTRIES)[number],
  locale?: string | null,
): Country {
  return {
    name: countryName(c.code, locale),
    countryCode: c.code,
    callingCode: c.dialCode,
    currency: COUNTRY_DEFAULTS[c.code]?.currency ?? "",
    flag: c.flag,
  };
}

/** Every country, alphabetical, named in English. */
export const countries: Country[] = COUNTRIES.map((c) => toCountry(c));

/** The country for an ISO code (named in `locale`), or null. */
export function countryForCode(
  code: string | null | undefined,
  locale?: string | null,
): Country | null {
  const found = code ? findCountry(code) : null;
  return found ? toCountry(found, locale) : null;
}

/**
 * Countries with `first` (the open markets, then the viewer's) on top and
 * the rest alphabetical, named and sorted in the reader's language.
 */
export function phoneCountries(
  first: readonly string[],
  locale?: string | null,
): Country[] {
  return prioritiseCountries(first, COUNTRIES, locale).map((c) =>
    toCountry(c, locale),
  );
}

/**
 * Case- and accent-insensitive match on the country's name (as listed, and
 * in English), dial code (with/without "+") or ISO code. Keeps the pool's
 * order, so the open markets stay on top while someone types.
 */
export function matchCountry(
  query: string,
  pool: readonly Country[] = countries,
): Country[] {
  const q = foldForSearch(query.trim()).replace(/^\+/, "");
  if (!q) return [...pool];
  return pool.filter(
    (c) =>
      foldForSearch(c.name).includes(q) ||
      foldForSearch(countryName(c.countryCode)).includes(q) ||
      c.callingCode.replace("+", "").startsWith(q) ||
      c.countryCode.toLowerCase() === q,
  );
}
