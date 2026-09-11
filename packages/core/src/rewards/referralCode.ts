// Personal referral codes: 7 characters from an alphabet with no look-alike
// characters (no I, L, O, 0 or 1), so a code read aloud or typed from a
// poster survives. The database enforces the same shape
// (referral_code.code CHECK); codes are created server-side only.

export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 7;

const CODE_PATTERN = /^[ABCDEFGHJKMNP-Z2-9]{7}$/;

/** The query parameter share links carry the code in. */
export const REFERRAL_QUERY_PARAM = "ref";

/**
 * A code as typed or pasted ("k7qx-2ma ", "K7QX2MA") in canonical form, or
 * null if it can't be a code. Doesn't say whether the code exists.
 */
export function normalizeReferralCode(
  input: string | null | undefined,
): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase().replace(/[\s-]/g, "");
  return CODE_PATTERN.test(code) ? code : null;
}

/** `url` with `?ref=CODE` set (replacing any existing ref). */
export function withReferralCode(url: string, code: string | null): string {
  if (!code) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(REFERRAL_QUERY_PARAM, code);
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${REFERRAL_QUERY_PARAM}=${encodeURIComponent(code)}`;
  }
}
