// Every country, for pickers and validation: ISO code, name, dial code and
// flag from the generated table. What a country USES (currency, time zone,
// address rules, distance unit) is market configuration, not a property of
// the dial code — see countryDefaults.ts for the curated defaults a new
// market starts from, and the `market` table for what is live.

import { COUNTRY_DATA, type CountryDatum } from "./countryData";

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

export function countryName(code: CountryCode): string {
  return findCountry(code)?.name ?? code;
}

export function countryFlag(code: CountryCode): string {
  return findCountry(code)?.flag ?? "";
}

/**
 * Case-insensitive match on name, dial code (with or without "+") or ISO
 * code, for a searchable picker. Empty query returns everything.
 */
export function matchCountries(
  query: string,
  pool: readonly Country[] = COUNTRIES,
): Country[] {
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  if (!q) return [...pool];
  return pool.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.dialCode.replace("+", "").startsWith(q) ||
      c.code.toLowerCase() === q,
  );
}

/**
 * Orders a pool so the given codes come first (the live markets, then the
 * viewer's own country), keeping the rest alphabetical.
 */
export function prioritiseCountries(
  first: readonly CountryCode[],
  pool: readonly Country[] = COUNTRIES,
): Country[] {
  const rank = new Map(first.map((c, i) => [c.toUpperCase(), i]));
  return [...pool].sort((a, b) => {
    const ra = rank.get(a.code) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(b.code) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, "en");
  });
}
