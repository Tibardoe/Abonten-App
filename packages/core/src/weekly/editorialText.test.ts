import { describe, expect, it } from "vitest";
import {
  sanitizeWeeklyLine,
  sanitizeWeeklyOptional,
  sanitizeWeeklyText,
  weeklyParagraphs,
} from "./editorialText";

const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);
const NUL = String.fromCharCode(0);
const BELL = String.fromCharCode(7);

describe("sanitizeWeeklyLine", () => {
  it("collapses whitespace and trims", () => {
    expect(sanitizeWeeklyLine("  Best  things\tto do \n this weekend  ")).toBe(
      "Best things to do this weekend",
    );
  });

  it("removes control, zero-width and bidi override characters", () => {
    expect(sanitizeWeeklyLine(`Acc${ZWSP}ra${RLO} picks${NUL}${BELL}`)).toBe(
      "Accra picks",
    );
  });

  it("keeps markup as literal text (rendering escapes it)", () => {
    expect(sanitizeWeeklyLine("<b>Bold</b> & <script>")).toBe(
      "<b>Bold</b> & <script>",
    );
  });

  it("handles empty input", () => {
    expect(sanitizeWeeklyLine(null)).toBe("");
    expect(sanitizeWeeklyLine(undefined)).toBe("");
  });
});

describe("sanitizeWeeklyText", () => {
  it("keeps paragraphs but at most one blank line between them", () => {
    expect(
      sanitizeWeeklyText("First line\r\n\r\n\r\n\r\nSecond   line  "),
    ).toBe("First line\n\nSecond line");
  });

  it("keeps single line breaks", () => {
    expect(sanitizeWeeklyText("One\nTwo")).toBe("One\nTwo");
  });
});

describe("sanitizeWeeklyOptional", () => {
  it("returns null for blank values", () => {
    expect(sanitizeWeeklyOptional("   ")).toBeNull();
    expect(sanitizeWeeklyOptional(`${ZWSP}`, true)).toBeNull();
    expect(sanitizeWeeklyOptional(" Hi ")).toBe("Hi");
  });
});

describe("weeklyParagraphs", () => {
  it("splits on blank lines", () => {
    expect(weeklyParagraphs("A\n\nB\nstill B\n\n\n\nC")).toEqual([
      "A",
      "B\nstill B",
      "C",
    ]);
    expect(weeklyParagraphs("")).toEqual([]);
  });
});
