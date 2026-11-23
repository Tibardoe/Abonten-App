// A short line of plain text a lister writes for everyone to read: a ticket
// type's note ("Kids: ages 3–12"), the name of a special date in a place's
// hours ("Christmas Day"). One rule for both, mirrored by the database's
// CHECK constraints (migration 20261123091000_ticket_notes_holiday_hours):
//
//   * spaces are folded (a line break or a tab becomes one space) and the
//     ends trimmed; empty is no note at all;
//   * at most `max` characters, counted as the database counts them (code
//     points, so an emoji is one);
//   * no links: nothing with "://" or "www.", the same test as the CHECK.
//
// Change this and the constraints together.

export type PlainNoteProblem = "too_long" | "link";

const LINK_RE = /:\/\/|www\./i;

/** The note as it is stored: spaces folded, trimmed; null when empty. */
export function normalizePlainNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/** Characters as the database counts them (code points). */
export function plainNoteLength(text: string): number {
  return Array.from(text).length;
}

/** What is wrong with a (normalized) note, or null when it may be saved. */
export function plainNoteProblem(
  note: string | null,
  max: number,
): PlainNoteProblem | null {
  if (note == null) return null;
  if (plainNoteLength(note) > max) return "too_long";
  if (LINK_RE.test(note)) return "link";
  return null;
}
