// Small date/time helpers shared by the creation wizards. Kept dependency-
// free — the pure-JS DateRangeField gives yyyy-mm-dd strings, and times are
// entered as "HH:MM" text, so this file just stitches the two into a Date.

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** yyyy-mm-dd for `d` in local time. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Today as yyyy-mm-dd (local). */
export function todayIso(): string {
  return isoDate(new Date());
}

/**
 * Combine a yyyy-mm-dd string and an "HH:MM" string into a local Date.
 * Returns null if either part is missing or malformed.
 */
export function combineDateAndTime(
  dateIso: string | null | undefined,
  time: string | null | undefined,
): Date | null {
  if (!dateIso || !time || !TIME_RE.test(time)) return null;
  const [y, m, d] = dateIso.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** "Fri, 5 Sep 2026" — a compact human date for review screens. */
export function prettyDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
