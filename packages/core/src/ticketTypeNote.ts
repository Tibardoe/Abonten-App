import type { CoreTranslator } from "./i18n/translator";
import {
  type PlainNoteProblem,
  normalizePlainNote,
  plainNoteProblem,
} from "./plainNote";

// What a ticket type includes, shown under its name on the event page, at
// checkout and in the organizer's lists ("Kids: ages 3–12", "Entry + 50
// ride credits"). Optional, plain text, one line (PROJECT.md §90). Stored
// in ticket_type.description; the database refuses what this refuses.
// The note changes no money, so it stays editable after the first sale.

export const TICKET_TYPE_NOTE_MAX = 140;

export type TicketTypeNoteProblem = PlainNoteProblem;

/** The note as it is stored: spaces folded, trimmed; null when empty. */
export function normalizeTicketTypeNote(value: unknown): string | null {
  return normalizePlainNote(value);
}

/** What is wrong with a (normalized) note, or null when it may be saved. */
export function ticketTypeNoteProblem(
  note: string | null,
): TicketTypeNoteProblem | null {
  return plainNoteProblem(note, TICKET_TYPE_NOTE_MAX);
}

export function ticketTypeNoteProblemMessage(
  t: CoreTranslator,
  problem: TicketTypeNoteProblem,
): string {
  return problem === "too_long"
    ? t("ticketTypeNote.tooLong", { max: TICKET_TYPE_NOTE_MAX })
    : t("ticketTypeNote.link");
}

/**
 * The first problem among several ticket types' notes, as a message, or
 * null — for a service checking a whole ticket editor at once.
 */
export function ticketTypeNotesProblemMessage(
  t: CoreTranslator,
  notes: readonly unknown[],
): string | null {
  for (const raw of notes) {
    const problem = ticketTypeNoteProblem(normalizeTicketTypeNote(raw));
    if (problem) return ticketTypeNoteProblemMessage(t, problem);
  }
  return null;
}
