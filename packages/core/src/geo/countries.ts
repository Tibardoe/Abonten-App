// Every country, for pickers and validation: ISO code, name, dial code and
// flag from the generated table. What a country USES (currency, time zone,
// address rules, distance unit) is market configuration, not a property of
// the dial code — see countryDefaults.ts for the curated defaults a new
// market starts from, and the `market` table for what is live.

import { coreLocale, intlLocale } from "../i18n/coreStrings";
import { foldSearchText } from "../search/foldSearchText";
import { COUNTRY_DATA, type CountryDatum } from "./countryData";
import { COUNTRY_NAMES } from "./countryNames.generated";

export type CountryCode = string;

export type Country = CountryDatum;

export const COUNTRIES: readonly Country[] = COUNTRY_DATA;

const BY_CODE: ReadonlyMap<string, Country> = new Map(
  COUNTRY_DATA.map((c) => [c.code, c]),
);

export function findCountry(code: unknown): Country | null {
  return typeof code === "string"
    ? (BY_CODE.get(code.toUpperCase()) ?? null)
    : null;
}

export function getCountry(code: CountryCode): Country {
  const c = findCountry(code);
  if (!c) throw new Error(`Unknown country: ${code}`);
  return c;
}

export function isKnownCountry(code: unknown): code is CountryCode {
  return findCountry(code) != null;
}

/**
 * The country's name in the reader's language ("Allemagne" in French), from
 * the CLDR names in countryNames.generated.ts; English when that language
 * has none, or when no language is given (logs, geocoding, staff tools).
 */
export function countryName(code: CountryCode, locale?: string | null): string {
  const country = findCountry(code);
  if (!country) return code;
  if (!locale) return country.name;
  return COUNTRY_NAMES[coreLocale(locale)]?.[country.code] ?? country.name;
}

export function countryFlag(code: CountryCode): string {
  return findCountry(code)?.flag ?? "";
}

/**
 * Case- and accent-insensitive match on the name (in the reader's language
 * and in English), dial code (with or without "+") or ISO code, for a
 * searchable picker. Empty query returns everything. Keeps the pool's order.
 */
export function matchCountries(
  query: string,
  pool: readonly Country[] = COUNTRIES,
  locale?: string | null,
): Country[] {
  const q = foldSearchText(query.trim()).replace(/^\+/, "");
  if (!q) return [...pool];
  return pool.filter(
    (c) =>
      foldSearchText(c.name).includes(q) ||
      foldSearchText(countryName(c.code, locale)).includes(q) ||
      c.dialCode.replace("+", "").startsWith(q) ||
      c.code.toLowerCase() === q,
  );
}

/**
 * Orders a pool so the given codes come first (the live markets, then the
 * viewer's own country), keeping the rest alphabetical in the reader's
 * language.
 */
export function prioritiseCountries(
  first: readonly CountryCode[],
  pool: readonly Country[] = COUNTRIES,
  locale?: string | null,
): Country[] {
  const rank = new Map(first.map((c, i) => [c.toUpperCase(), i]));
  const tag = intlLocale(locale);
  return [...pool].sort((a, b) => {
    const ra = rank.get(a.code) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(b.code) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return countryName(a.code, locale).localeCompare(
      countryName(b.code, locale),
      tag,
    );
  });
}
