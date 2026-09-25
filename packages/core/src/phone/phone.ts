// International phone numbers, backed by libphonenumber (the same rules
// Google, Twilio and every national numbering plan follow). The canonical
// stored form everywhere is E.164 ("+233241234567"); the UI shows the
// national format the person recognises ("024 123 4567", "07400 123456").
//
// Uses the `max` metadata set (~145 kB): exact national number patterns, so
// validation and the country of a shared code (+44 GB vs Jersey) are right.
// `min` was tried first and guessed Guernsey for London numbers.

import {
  type CountryCode as LibCountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js/max";

export type PhoneParseResult =
  | {
      ok: true;
      e164: string;
      /** ISO 3166-1 alpha-2 the number belongs to, when known. */
      country: string | null;
      national: string;
      international: string;
      dialCode: string;
    }
  | { ok: false; error: PhoneError };

export type PhoneError =
  | "empty"
  | "invalid_country"
  | "too_short"
  | "too_long"
  | "invalid";

export const PHONE_ERROR_MESSAGE: Record<PhoneError, string> = {
  empty: "Enter a phone number.",
  invalid_country: "Select a country code.",
  too_short: "That phone number is too short.",
  too_long: "That phone number is too long.",
  invalid: "Enter a valid phone number.",
};

function isLibCountry(code: string | null | undefined): code is LibCountryCode {
  return !!code && (getCountries() as string[]).includes(code.toUpperCase());
}

// The "main" country of a calling code that several countries share. The
// `min` metadata cannot always tell +1 US from +1 Canada or +44 GB from
// Jersey, and returns no country; these are the answers a picker expects.
const MAIN_COUNTRY_FOR_DIAL_CODE: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "39": "IT",
  "44": "GB",
  "45": "DK",
  "47": "NO",
  "61": "AU",
  "212": "MA",
  "262": "RE",
  "290": "SH",
  "358": "FI",
  "590": "GP",
  "599": "CW",
};

/**
 * Parses what a person typed. `defaultCountry` is the country the input's
 * dial-code picker shows; a number typed with its own "+" prefix wins over
 * it, so a pasted "+44 7911 123456" parses as UK even in a Ghana form.
 */
export function parsePhone(
  raw: string,
  defaultCountry?: string | null,
): PhoneParseResult {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, error: "empty" };
  const country = defaultCountry?.toUpperCase();
  if (!text.startsWith("+") && !isLibCountry(country)) {
    return { ok: false, error: "invalid_country" };
  }
  const parsed = parsePhoneNumberFromString(
    text,
    isLibCountry(country) ? country : undefined,
  );
  if (!parsed) return { ok: false, error: "invalid" };
  if (!parsed.isPossible()) {
    const digits = parsed.nationalNumber.length;
    return {
      ok: false,
      error: digits < 6 ? "too_short" : digits > 14 ? "too_long" : "invalid",
    };
  }
  if (!parsed.isValid()) return { ok: false, error: "invalid" };
  return {
    ok: true,
    e164: parsed.number,
    country:
      parsed.country ?? countryForDialCode(`+${parsed.countryCallingCode}`),
    national: parsed.formatNational(),
    international: parsed.formatInternational(),
    dialCode: `+${parsed.countryCallingCode}`,
  };
}

/**
 * The picker + number shape both apps use: a dial code ("+233") and the
 * digits typed next to it. Accepts a local trunk prefix ("024…"), the full
 * international form, or the number with the dial code repeated.
 */
export function parsePhoneWithDialCode(
  dialCode: string,
  raw: string,
): PhoneParseResult {
  const country = countryForDialCode(dialCode);
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, error: "empty" };
  if (text.startsWith("+")) return parsePhone(text, country);
  const dialDigits = dialCode.replace(/\D/g, "");
  const digits = text.replace(/[^\d]/g, "");
  if (!dialDigits) return { ok: false, error: "invalid_country" };
  // "233241234567" typed without the "+": treat as international.
  if (digits.startsWith(dialDigits) && digits.length > dialDigits.length + 5) {
    const asInternational = parsePhone(`+${digits}`, country);
    if (asInternational.ok) return asInternational;
  }
  return parsePhone(`+${dialDigits}${digits.replace(/^0+/, "")}`, country);
}

export function isValidPhone(e164: string): boolean {
  return parsePhone(e164).ok;
}

/** "024 123 4567" for a Ghana number, "07400 123456" for a UK one. */
export function formatPhoneNational(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatNational() : e164;
}

/** "+233 24 123 4567". */
export function formatPhoneInternational(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed ? parsed.formatInternational() : e164;
}

/** The ISO country of an E.164 number, or null. */
export function phoneCountry(e164: string): string | null {
  return parsePhoneNumberFromString(e164)?.country ?? null;
}

/** "+233" for "GH". Null for an unknown country. */
export function dialCodeFor(country: string): string | null {
  const code = country.toUpperCase();
  return isLibCountry(code) ? `+${getCountryCallingCode(code)}` : null;
}

/**
 * The most likely country for a dial code ("+1" -> "US", "+44" -> "GB",
 * "+233" -> "GH"). Shared codes resolve to libphonenumber's main country.
 */
export function countryForDialCode(dialCode: string): string | null {
  const digits = dialCode.replace(/\D/g, "");
  if (!digits) return null;
  const main = MAIN_COUNTRY_FOR_DIAL_CODE[digits];
  if (main) return main;
  for (const c of getCountries()) {
    if (getCountryCallingCode(c) === digits) return c;
  }
  return null;
}

/**
 * Masks all but the dial code and last two digits, for the OTP screen:
 * "+233 24 *** **67" style without hardcoding a country grouping.
 */
export function maskPhoneNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length <= 4) return e164;
  const visibleStart = digits.slice(0, Math.max(digits.length - 6, 1));
  const visibleEnd = digits.slice(-2);
  const maskedLength = digits.length - visibleStart.length - visibleEnd.length;
  return `+${visibleStart}${"*".repeat(Math.max(maskedLength, 0))}${visibleEnd}`;
}
