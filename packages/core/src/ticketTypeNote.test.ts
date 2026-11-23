import { describe, expect, it } from "vitest";
import { t } from "./i18n/testTranslator";
import { normalizePlainNote, plainNoteLength } from "./plainNote";
import {
  TICKET_TYPE_NOTE_MAX,
  normalizeTicketTypeNote,
  ticketTypeNoteProblem,
  ticketTypeNoteProblemMessage,
  ticketTypeNotesProblemMessage,
} from "./ticketTypeNote";

describe("ticket type notes", () => {
  it("folds spaces and trims; empty is no note", () => {
    expect(normalizeTicketTypeNote("  Kids:\n ages 3–12  ")).toBe(
      "Kids: ages 3–12",
    );
    expect(normalizeTicketTypeNote("   ")).toBeNull();
    expect(normalizeTicketTypeNote(null)).toBeNull();
    expect(normalizeTicketTypeNote(42)).toBeNull();
  });

  it("accepts a short plain note", () => {
    expect(ticketTypeNoteProblem("Entry + 50 ride credits")).toBeNull();
    expect(ticketTypeNoteProblem(null)).toBeNull();
    expect(ticketTypeNoteProblem("x".repeat(TICKET_TYPE_NOTE_MAX))).toBeNull();
  });

  it("refuses a long note, counting characters as the database does", () => {
    expect(ticketTypeNoteProblem("x".repeat(TICKET_TYPE_NOTE_MAX + 1))).toBe(
      "too_long",
    );
    // An emoji is two UTF-16 units but one character for Postgres.
    expect(plainNoteLength("🎢🎢")).toBe(2);
    expect(ticketTypeNoteProblem("🎢".repeat(TICKET_TYPE_NOTE_MAX))).toBeNull();
  });

  it("refuses links, as the database CHECK does", () => {
    expect(ticketTypeNoteProblem("Book at https://example.com")).toBe("link");
    expect(ticketTypeNoteProblem("See WWW.example.com")).toBe("link");
    expect(ticketTypeNoteProblem("Ages 3–12 (www)")).toBeNull();
  });

  it("words a problem in the reader's language", () => {
    expect(ticketTypeNoteProblemMessage(t, "too_long")).toContain(
      String(TICKET_TYPE_NOTE_MAX),
    );
    expect(ticketTypeNoteProblemMessage(t, "link")).not.toMatch(
      /ticketTypeNote\./,
    );
    expect(ticketTypeNotesProblemMessage(t, ["Family day", "http://x.y"])).toBe(
      ticketTypeNoteProblemMessage(t, "link"),
    );
    expect(ticketTypeNotesProblemMessage(t, ["Family day", null])).toBeNull();
  });

  it("is the shared plain-note rule", () => {
    expect(normalizePlainNote("a\tb")).toBe("a b");
  });
});
