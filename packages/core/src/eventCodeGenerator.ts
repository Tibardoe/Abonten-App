// An event's public code: the identifier in /events/<code> links, on tickets
// and in shared posts. Up to two letters from the title (so "Tech
// Conference" reads TC…), then six random characters.
//
// The code must be unique (event.event_code). It used to be the prefix plus
// four random digits — 9,000 codes per prefix — so two events whose titles
// start with the same letters collided often enough to fail a post. Six
// characters from a 31-symbol alphabet give ~887 million codes per prefix;
// postEventCore still retries with a fresh code if one ever collides.
//
// Only A–Z and 2–9, without the look-alikes 0/O and 1/I/L: links lower-case
// the code and pages upper-case it again, and people read codes aloud.

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RANDOM_LENGTH = 6;
const FALLBACK_PREFIX = "EV";

/** Fills `bytes` with random values (Web Crypto by default). */
export type RandomBytes = (bytes: Uint8Array) => Uint8Array;

const cryptoRandom: RandomBytes = (bytes) => crypto.getRandomValues(bytes);

/** The first letter or digit of the title's first two words, upper case. */
export function eventCodePrefix(title: string): string {
  // Accented letters become their base letter ("É" → "E"): decompose, then
  // drop the combining marks (U+0300–U+036F).
  const plain = Array.from(title.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f;
    })
    .join("");
  const initials = plain
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return initials || FALLBACK_PREFIX;
}

export function generateEventCode(
  title: string,
  random: RandomBytes = cryptoRandom,
): string {
  let suffix = "";
  // Rejection sampling keeps every symbol equally likely: bytes at or above
  // the largest multiple of the alphabet size are drawn again.
  const limit = 256 - (256 % ALPHABET.length);
  while (suffix.length < RANDOM_LENGTH) {
    for (const byte of random(new Uint8Array(RANDOM_LENGTH * 2))) {
      if (byte >= limit) continue;
      suffix += ALPHABET[byte % ALPHABET.length];
      if (suffix.length === RANDOM_LENGTH) break;
    }
  }
  return `${eventCodePrefix(title)}${suffix}`;
}
