// Usernames (the @handle in /user/<username>/posts): one rule for people and
// teams (docs/architecture/team-accounts.md §4n). The database keeps the same
// rule: user_info_username_check accepts ^[a-z0-9_]{3,30}$ in any case, the
// unique index compares without case, and a deleted account's handle starts
// with deleted_ (anonymize_deleted_account), so nobody may choose one. A
// handle someone gave up in the last 30 days is held for them
// (public.username_states, trigger user_info_username_hold).
//
// Codes only: screens turn a problem into words.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/** How long a handle someone gave up stays theirs (and redirects to them). */
export const USERNAME_HOLD_DAYS = 30;

const ALLOWED = /^[a-z0-9_]+$/i;
const RESERVED = /^deleted_/i;

export type UsernameProblem = "short" | "long" | "characters" | "reserved";

/** What a person typed, as a handle: trimmed, without a leading "@". */
export function normalizeUsernameInput(raw: string): string {
  return raw.trim().replace(/^@+/, "");
}

/** Why a handle cannot be used, or null when it is well formed. */
export function usernameProblem(handle: string): UsernameProblem | null {
  if (handle.length < USERNAME_MIN_LENGTH) return "short";
  if (handle.length > USERNAME_MAX_LENGTH) return "long";
  if (!ALLOWED.test(handle)) return "characters";
  if (RESERVED.test(handle)) return "reserved";
  return null;
}

/** Same handle, whatever the case (the database compares without case). */
export function sameUsername(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Combining accents (U+0300–U+036F) left by NFD: dropped. */
function withoutAccents(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFD")) {
    const code = ch.charCodeAt(0);
    if (code < 0x300 || code > 0x36f) out += ch;
  }
  return out;
}

/**
 * Lower-case letters, digits and single underscores: "Kɔfi's Bar & Grill"
 * → "kofis_bar_grill". Accents are dropped; letters a plain keyboard lacks
 * (ɔ, ɛ, ŋ) become the ones people type for them.
 */
export function slugForUsername(text: string): string {
  return withoutAccents(text)
    .replace(/ɔ/gi, "o")
    .replace(/ɛ/gi, "e")
    .replace(/ŋ/gi, "n")
    .replace(/['’`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** `base` cut so that `base + suffix` fits, without a trailing underscore. */
function fit(base: string, suffix: string): string {
  const room = USERNAME_MAX_LENGTH - suffix.length;
  return `${base.slice(0, room).replace(/_+$/, "")}${suffix}`;
}

/** A small stable number for a text, so suggestions don't jump as you type. */
function stableNumber(text: string): number {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h;
}

export type UsernameSuggestionInput = {
  /** What the person typed (the handle they wanted). */
  typed?: string | null;
  /** The person's or the team's name. */
  name?: string | null;
  /** A city the account is known in (a place it runs), when there is one. */
  city?: string | null;
  /** The account's country code ("GH"). */
  country?: string | null;
  /** A team also gets business-like endings ("_hq"). */
  kind?: "person" | "team";
};

/**
 * Handles to offer when the one typed is taken, best first: the typed
 * handle (or the name) with the city, the country, then a short ending.
 * Every one is well formed and none is the typed handle itself; the
 * caller checks which are free (public.username_states) and shows two or
 * three.
 */
export function suggestUsernames(
  input: UsernameSuggestionInput,
  limit = 12,
): string[] {
  const typed = slugForUsername(normalizeUsernameInput(input.typed ?? ""));
  const name = slugForUsername(input.name ?? "");
  const bases = [
    ...new Set(
      [typed, name, name.replace(/_/g, "")].filter(
        (b) => b.length >= 2 && !RESERVED.test(b),
      ),
    ),
  ];
  const city = slugForUsername(input.city ?? "").replace(/_/g, "");
  const country = slugForUsername(input.country ?? "").replace(/_/g, "");
  // Endings a business might use; a person gets numbers instead (never
  // "official"-style endings, which read as Abonten vouching for them).
  const endings = input.kind === "team" ? ["_hq", "_events", "_live"] : [];

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (candidate: string) => {
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    if (typed && key === typed) return;
    if (usernameProblem(candidate) !== null) return;
    seen.add(key);
    out.push(candidate);
  };

  for (const base of bases) {
    if (city) add(fit(base, `_${city}`));
    if (country.length === 2) add(fit(base, `_${country}`));
  }
  for (const base of bases) {
    for (const ending of endings) add(fit(base, ending));
  }
  for (const base of bases) {
    const n = stableNumber(base);
    add(fit(base, `_${10 + (n % 90)}`));
    add(fit(base, `_${100 + ((n * 7) % 900)}`));
  }
  return out.slice(0, limit);
}
