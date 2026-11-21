import { describe, expect, it } from "vitest";
import { parseRoundupKey, roundupCoverPath } from "./roundups";

describe("parseRoundupKey", () => {
  it("reads a week that starts on a Monday", () => {
    expect(parseRoundupKey("week:2026-11-23")).toEqual({
      kind: "week",
      start: "2026-11-23",
      end: "2026-11-29",
      key: "week:2026-11-23",
      slug: "week-2026-11-23",
    });
  });

  it("reads a weekend from its address form, across a month end", () => {
    expect(parseRoundupKey("weekend-2027-01-29")).toMatchObject({
      kind: "weekend",
      start: "2027-01-29",
      end: "2027-01-31",
      key: "weekend:2027-01-29",
    });
    expect(parseRoundupKey("weekend:2026-12-25")?.end).toBe("2026-12-27");
  });

  it("refuses a week that does not start on a Monday", () => {
    expect(parseRoundupKey("week:2026-11-24")).toBeNull();
    expect(parseRoundupKey("weekend:2026-11-28")).toBeNull();
  });

  it("refuses days that do not exist and anything else", () => {
    expect(parseRoundupKey("week:2026-02-30")).toBeNull();
    expect(parseRoundupKey("month:2026-11-02")).toBeNull();
    expect(parseRoundupKey("week:26-11-23")).toBeNull();
    expect(parseRoundupKey("week-2026-11-23/../x")).toBeNull();
    expect(parseRoundupKey(null)).toBeNull();
  });
});

describe("roundupCoverPath", () => {
  it("uses the address form and the language", () => {
    const r = parseRoundupKey("week:2026-11-23");
    if (!r) throw new Error("expected a roundup");
    expect(roundupCoverPath(r, "fr")).toBe(
      "/api/share/roundups/week-2026-11-23/cover?hl=fr",
    );
  });
});
