// The weekly roundups of the posting queue
// (docs/architecture/social-distribution.md): "What's on in Accra this
// week" (Monday to Sunday) and "This weekend in Accra" (Friday to Sunday). A roundup is named by its kind and its first
// day, e.g. `week:2026-11-23` or `weekend:2026-11-27`, the form stored in
// social_post.roundup_key (the database checks the same shape). In an
// address the colon becomes a dash: /api/share/roundups/week-2026-11-23/cover.
// Days are calendar days of the market the roundup covers; nothing here
// reads a clock.

export const ROUNDUP_KINDS = ["week", "weekend"] as const;
export type RoundupKind = (typeof ROUNDUP_KINDS)[number];

/** Most events one roundup lists (the database keeps the same limit). */
export const ROUNDUP_MAX_EVENTS = 10;

/**
 * The city a roundup lists events in, is named after and links to (its
 * Explore page): social_queue_roundup() keeps to this market_region's radius
 * around its centre (slug 'accra' in the default market; change the two
 * together). The cover's words (server.json › shareKit) name it too.
 */
export const ROUNDUP_CITY = { slug: "accra", name: "Accra" } as const;

/** The roundup's cover, a 4:5 feed image. */
export const ROUNDUP_COVER_SIZE = { width: 1080, height: 1350 } as const;

export type Roundup = {
  kind: RoundupKind;
  /** First day, YYYY-MM-DD: a Monday for a week, a Friday for a weekend. */
  start: string;
  /** Last day, YYYY-MM-DD, inclusive: the Sunday. */
  end: string;
  /** `week:2026-11-23` */
  key: string;
  /** `week-2026-11-23`, the form used in an address. */
  slug: string;
};

const DAY_MS = 86_400_000;
const KEY = /^(week|weekend)[:-](\d{4}-\d{2}-\d{2})$/;

function dayOf(date: string): Date | null {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // "2026-02-31" parses to 3 March: only a real calendar day comes back
  // as itself.
  return d.toISOString().slice(0, 10) === date ? d : null;
}

function plusDays(d: Date, days: number): string {
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A roundup from its key (`week:2026-11-23`) or its address form
 * (`week-2026-11-23`), or null when the text names no real roundup: an
 * unknown kind, a day that does not exist, or a week that does not start on
 * a Monday (a weekend on a Friday).
 */
export function parseRoundupKey(value: unknown): Roundup | null {
  if (typeof value !== "string") return null;
  const m = KEY.exec(value.trim());
  if (!m) return null;
  const kind = m[1] as RoundupKind;
  const start = m[2];
  const day = dayOf(start);
  if (!day) return null;
  // getUTCDay: 1 = Monday, 5 = Friday.
  if (day.getUTCDay() !== (kind === "week" ? 1 : 5)) return null;
  return {
    kind,
    start,
    end: plusDays(day, kind === "week" ? 6 : 2),
    key: `${kind}:${start}`,
    slug: `${kind}-${start}`,
  };
}

/** The address of a roundup's cover image, words in `locale`. */
export function roundupCoverPath(roundup: Roundup, locale: string): string {
  return `/api/share/roundups/${roundup.slug}/cover?hl=${encodeURIComponent(locale)}`;
}

/** File name for a downloaded cover, e.g. "abonten-week-2026-11-23-cover.png". */
export function roundupCoverFileName(roundup: Roundup): string {
  return `abonten-${roundup.slug}-cover.png`;
}
