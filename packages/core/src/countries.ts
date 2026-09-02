// The curated set of countries Abonten supports for phone sign-in and
// currency handling. Kept small and hand-verified (dial codes, ISO codes,
// ISO-4217 currency, flag emoji) rather than pulled from a live API — the
// restcountries.com v3.1 endpoint this app once used is deprecated and now
// errors on every request, and a static list needs no external flag host.
//
// This is the single source of truth: apps/web/src/data/countryDetails.ts
// re-exports it, and the mobile auth country picker consumes it directly.

export type Country = {
  name: string;
  /** ISO 3166-1 alpha-2. */
  countryCode: string;
  /** E.164 dial prefix, incl. the leading "+". */
  callingCode: string;
  /** ISO 4217. */
  currency: string;
  /** Unicode flag emoji. */
  flag: string;
};

export const countries: Country[] = [
  {
    name: "Ghana",
    countryCode: "GH",
    callingCode: "+233",
    currency: "GHS",
    flag: "🇬🇭",
  },
  {
    name: "Nigeria",
    countryCode: "NG",
    callingCode: "+234",
    currency: "NGN",
    flag: "🇳🇬",
  },
  {
    name: "South Africa",
    countryCode: "ZA",
    callingCode: "+27",
    currency: "ZAR",
    flag: "🇿🇦",
  },
  {
    name: "Kenya",
    countryCode: "KE",
    callingCode: "+254",
    currency: "KES",
    flag: "🇰🇪",
  },
  {
    name: "Rwanda",
    countryCode: "RW",
    callingCode: "+250",
    currency: "RWF",
    flag: "🇷🇼",
  },
  {
    name: "Botswana",
    countryCode: "BW",
    callingCode: "+267",
    currency: "BWP",
    flag: "🇧🇼",
  },
];

/** The default sign-in country (Abonten is Ghana-first). */
export const DEFAULT_COUNTRY: Country = countries[0];

/** Case-insensitive match on country name or dial code (with/without "+"). */
export function matchCountry(query: string): Country[] {
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  if (!q) return countries;
  return countries.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.callingCode.replace("+", "").includes(q) ||
      c.countryCode.toLowerCase() === q,
  );
}
