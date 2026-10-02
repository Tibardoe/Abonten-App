import { describe, expect, it } from "vitest";
import { runWithLocale } from "../../i18n/requestLocale";
import { TIMELINE_NOTE, wordTimelineNote } from "./timelineNotes";

describe("the onboarding timeline's own entries", () => {
  it("are stored in one fixed form", () => {
    expect(TIMELINE_NOTE.started).toBe("Started");
    expect(TIMELINE_NOTE.claimFiledFor("Buka")).toBe("Claim filed for Buka");
    expect(TIMELINE_NOTE.eventListedFor("2026-10-10")).toBe(
      "Event listed for 2026-10-10",
    );
  });

  it("read as written to someone reading English", () => {
    expect(wordTimelineNote(TIMELINE_NOTE.started)).toBe("Started");
    expect(wordTimelineNote(TIMELINE_NOTE.ownerCodeSent)).toBe(
      "Owner code sent",
    );
    expect(wordTimelineNote(TIMELINE_NOTE.claimFiledFor("Buka"))).toBe(
      "Claim filed for Buka",
    );
    expect(wordTimelineNote(TIMELINE_NOTE.eventListedFor("2026-10-10"))).toBe(
      "Event listed for Sat, 10 Oct 2026",
    );
  });

  it("are said in the language of whoever opens the timeline", () => {
    const french = (note: string) =>
      runWithLocale("fr", () => wordTimelineNote(note));
    expect(french(TIMELINE_NOTE.started)).toBe("Démarré");
    expect(french(TIMELINE_NOTE.ownerVerified)).toBe(
      "Le propriétaire a vérifié son téléphone",
    );
    expect(french(TIMELINE_NOTE.claimFiledFor("Buka"))).toBe(
      "Revendication déposée pour Buka",
    );
    expect(french(TIMELINE_NOTE.eventListedFor("2026-10-10"))).toMatch(
      /^Événement référencé pour le sam\. 10 oct\. 2026$/,
    );
  });

  it("read an entry written before the day was stored as a date", () => {
    // Date.toDateString(), which the first version stored.
    const old = "Event listed for Sat Oct 10 2026";
    expect(runWithLocale("fr", () => wordTimelineNote(old))).toContain(
      "10 oct. 2026",
    );
  });

  it("leave a note a person wrote exactly as it is", () => {
    const written = "Storefront photo is blurry, please retake it.";
    expect(runWithLocale("fr", () => wordTimelineNote(written))).toBe(written);
    expect(wordTimelineNote(null)).toBeNull();
    expect(wordTimelineNote("")).toBe("");
  });
});
