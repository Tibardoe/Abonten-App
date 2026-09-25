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
  matchCountries,
  prioritiseCountries,
} from "./geo/countries";
import { COUNTRY_DEFAULTS } from "./geo/countryDefaults";

export type Country = {
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

function toCountry(c: (typeof COUNTRIES)[number]): Country {
  return {
    name: c.name,
    countryCode: c.code,
    callingCode: c.dialCode,
    currency: COUNTRY_DEFAULTS[c.code]?.currency ?? "",
    flag: c.flag,
  };
}

/** Every country, alphabetical. */
export const countries: Country[] = COUNTRIES.map(toCountry);

/** The country for an ISO code, or null. */
export function countryForCode(
  code: string | null | undefined,
): Country | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return countries.find((c) => c.countryCode === upper) ?? null;
}

/** Countries with `first` (the open markets, then the viewer's) on top. */
export function phoneCountries(first: readonly string[]): Country[] {
  return prioritiseCountries(first, COUNTRIES).map(toCountry);
}

/** Case-insensitive match on country name, dial code (with/without "+") or ISO code. */
export function matchCountry(
  query: string,
  pool: readonly Country[] = countries,
): Country[] {
  const codes = new Set(pool.map((c) => c.countryCode));
  const ordered = COUNTRIES.filter((c) => codes.has(c.code));
  const byCode = new Map(pool.map((c) => [c.countryCode, c]));
  return matchCountries(query, ordered).map(
    (c) => byCode.get(c.code) as Country,
  );
}
