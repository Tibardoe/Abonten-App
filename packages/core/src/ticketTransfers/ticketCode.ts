// Ticket codes (decision X15, Tickets, entry and teams plan).
//
// A new ticket code is "TKT-" followed by 12 characters: 11 random ones and
// a check character. The alphabet leaves out the characters people confuse
// when they read a code aloud or type it (0 and O, 1, I and L), so it has 31
// characters; 31^11 is about 2.5 x 10^16 codes. The check character makes
// the weighted sum of the 12 characters (weights 1 to 12) a multiple of 31.
// Because 31 is prime, that catches every single wrong character and every
// swap of two neighbouring characters (Luhn mod N cannot promise this with
// an odd alphabet), so a typo reads "Not a valid code" instead of finding
// somebody else's ticket.
//
// Codes issued before this format ("TKT-" + 8 hex characters) stay valid
// for ever: nothing here rewrites a stored code. The stored form has no
// spaces or hyphens after the prefix, so an older app's scanner (which
// reads /TKT-[A-Z0-9]+/) still reads a new code whole; the grouped form
// "ABCD EFGH JKMN" is only for showing and reading out.

export const TICKET_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const N = TICKET_CODE_ALPHABET.length; // 31
const PAYLOAD_LENGTH = 11;
export const TICKET_CODE_LENGTH = PAYLOAD_LENGTH + 1;
const PREFIX = "TKT-";

const NEW_CODE_RE = new RegExp(
  `^${PREFIX}[${TICKET_CODE_ALPHABET}]{${TICKET_CODE_LENGTH}}$`,
);
const LEGACY_CODE_RE = /^TKT-[0-9A-F]{8}$/;

function charValue(char: string): number {
  return TICKET_CODE_ALPHABET.indexOf(char);
}

// The inverse of the check character's weight (12) modulo 31: 12 x 13 = 156
// = 5 x 31 + 1.
const CHECK_WEIGHT_INVERSE = 13;

/** Sum of (position + 1) x value over `chars`, or -1 for a foreign char. */
function weightedSum(chars: string): number {
  let sum = 0;
  for (let i = 0; i < chars.length; i++) {
    const value = charValue(chars.charAt(i));
    if (value < 0) return -1;
    sum += (i + 1) * value;
  }
  return sum;
}

/** The check character that completes `payload` (11 alphabet characters). */
export function ticketCodeCheckChar(payload: string): string {
  const sum = weightedSum(payload);
  if (sum < 0 || payload.length !== PAYLOAD_LENGTH) {
    throw new Error("ticket code: payload must be 11 alphabet characters");
  }
  const value = (((N - (sum % N)) % N) * CHECK_WEIGHT_INVERSE) % N;
  return TICKET_CODE_ALPHABET.charAt(value);
}

/** True when the 12 characters after the prefix carry a matching check. */
function checksOut(body: string): boolean {
  const sum = weightedSum(body);
  return body.length === TICKET_CODE_LENGTH && sum >= 0 && sum % N === 0;
}

type RandomBytes = (length: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * A fresh code in the new format. Rejection sampling keeps every character
 * equally likely (248 = 8 x 31 is the largest multiple of 31 under 256).
 */
export function newTicketCode(
  randomBytes: RandomBytes = defaultRandomBytes,
): string {
  let payload = "";
  while (payload.length < PAYLOAD_LENGTH) {
    for (const byte of randomBytes(PAYLOAD_LENGTH * 2)) {
      if (byte >= 248) continue;
      payload += TICKET_CODE_ALPHABET.charAt(byte % N);
      if (payload.length === PAYLOAD_LENGTH) break;
    }
  }
  return `${PREFIX}${payload}${ticketCodeCheckChar(payload)}`;
}

/** True for a well-formed new-format code whose check character matches. */
export function isValidNewTicketCode(code: string): boolean {
  return NEW_CODE_RE.test(code) && checksOut(code.slice(PREFIX.length));
}

export function isLegacyTicketCode(code: string): boolean {
  return LEGACY_CODE_RE.test(code);
}

/**
 * The code as a person reads it: a new code in three groups of four
 * ("ABCD EFGH JKMN"); an older code exactly as it was printed.
 */
export function formatTicketCodeForReading(
  code: string | null | undefined,
): string {
  if (!code) return "";
  if (!NEW_CODE_RE.test(code)) return code;
  const body = code.slice(PREFIX.length);
  return `${body.slice(0, 4)} ${body.slice(4, 8)} ${body.slice(8)}`;
}

export type TypedTicketCode =
  | { ok: true; code: string }
  | { ok: false; reason: "empty" | "format" | "check" };

/**
 * What a person typed or read out, turned into the stored form: spaces,
 * hyphens and the "TKT" prefix are optional, case does not matter. A new
 * code whose check character does not match is refused here, before any
 * lookup, so a typo can never land on another ticket.
 */
export function normalizeTypedTicketCode(input: string): TypedTicketCode {
  const compact = input.toUpperCase().replace(/[\s-]+/g, "");
  if (!compact) return { ok: false, reason: "empty" };
  const body = compact.startsWith("TKT") ? compact.slice(3) : compact;
  if (/^[0-9A-F]{8}$/.test(body)) {
    return { ok: true, code: `${PREFIX}${body}` };
  }
  if (body.length === TICKET_CODE_LENGTH) {
    const code = `${PREFIX}${body}`;
    if (!NEW_CODE_RE.test(code)) return { ok: false, reason: "format" };
    return checksOut(body)
      ? { ok: true, code }
      : { ok: false, reason: "check" };
  }
  return { ok: false, reason: "format" };
}
