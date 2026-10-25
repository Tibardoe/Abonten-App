import { describe, expect, it } from "vitest";
import { snippetText } from "./snippet";

describe("snippetText", () => {
  it("keeps a short text as one line", () => {
    expect(snippetText("  Live music\n\nand   food  ")).toBe(
      "Live music and food",
    );
    expect(snippetText(null)).toBe("");
  });

  it("cuts a long text where a word ends and marks the cut", () => {
    const text = `${"word ".repeat(40)}end`;
    const out = snippetText(text, 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith("word…")).toBe(true);
  });

  it("drops punctuation left at the cut", () => {
    expect(snippetText("Highlife, palm wine, and dancing all night", 21)).toBe(
      "Highlife, palm wine…",
    );
  });

  it("cuts a single very long word where it stands", () => {
    const out = snippetText("x".repeat(50), 20);
    expect(out).toBe(`${"x".repeat(19)}…`);
  });
});
