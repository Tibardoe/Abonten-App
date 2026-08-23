export type NormalizePhoneNumberResult =
  | { ok: true; e164: string }
  | { ok: false; error: string };

const MIN_E164_DIGITS = 8;
const MAX_E164_DIGITS = 15;

// Single authoritative phone-number normalizer. Takes the dial code the
// user picked in PhoneInput (e.g. "+233") and whatever they typed in the
// number field, and produces one canonical E.164 string ("+233241234567")
// regardless of whether they typed a local number with a leading 0, pasted
// the full international number, or included stray spaces/dashes. Not
// Ghana-specific -- works off whichever dial code PhoneInput/countryDetails
// (src/data/countryDetails.ts) supplied.
export function normalizePhoneNumber(
  dialCode: string,
  rawInput: string,
): NormalizePhoneNumberResult {
  const dialDigits = dialCode.replace(/\D/g, "");
  let localDigits = rawInput.replace(/\D/g, "");

  if (!dialDigits) {
    return { ok: false, error: "Select a country code." };
  }

  if (!localDigits) {
    return { ok: false, error: "Enter a phone number." };
  }

  // Already includes the country code (pasted "+233241234567" or
  // "233241234567") -- strip it so we don't double it up below.
  if (localDigits.startsWith(dialDigits)) {
    localDigits = localDigits.slice(dialDigits.length);
  }

  // Local format with a trunk prefix, e.g. Ghana "0241234567".
  if (localDigits.startsWith("0")) {
    localDigits = localDigits.slice(1);
  }

  if (!localDigits) {
    return { ok: false, error: "Enter a phone number." };
  }

  const combined = `${dialDigits}${localDigits}`;

  if (combined.length < MIN_E164_DIGITS || combined.length > MAX_E164_DIGITS) {
    return { ok: false, error: "Enter a valid phone number." };
  }

  return { ok: true, e164: `+${combined}` };
}

// Masks all but the country code and last two digits, for display in the
// OTP screen: "+233 24 *** **67" style masking without hardcoding a
// country-specific grouping.
export function maskPhoneNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length <= 4) return e164;

  const visibleStart = digits.slice(0, Math.max(digits.length - 6, 1));
  const visibleEnd = digits.slice(-2);
  const maskedLength = digits.length - visibleStart.length - visibleEnd.length;

  return `+${visibleStart}${"*".repeat(Math.max(maskedLength, 0))}${visibleEnd}`;
}
