import { describe, expect, it } from "vitest";
import {
  SEARCH_QUERY_MAX_LENGTH,
  isSearchableQuery,
  normalizeSearchQuery,
  parseSearchQuery,
} from "./parseSearchQuery";

describe("normalizeSearchQuery", () => {
  it("lower-cases, collapses whitespace and trims", () => {
    expect(normalizeSearchQuery("  Jazz\t\tNIGHT \n")).toBe("jazz night");
  });

  it("replaces control characters with spaces", () => {
    expect(normalizeSearchQuery("jazz\u0007night\u0000")).toBe("jazz night");
  });

  it("caps the length", () => {
    expect(normalizeSearchQuery("a".repeat(500))).toHaveLength(
      SEARCH_QUERY_MAX_LENGTH,
    );
  });

  it("treats null and undefined as empty", () => {
    expect(normalizeSearchQuery(null)).toBe("");
    expect(normalizeSearchQuery(undefined)).toBe("");
  });
});

describe("parseSearchQuery", () => {
  it("detects organizer mode case-insensitively", () => {
    expect(parseSearchQuery("@Abonten_Hub")).toEqual({
      kind: "organizer",
      normalized: "@abonten_hub",
      handle: "abonten_hub",
    });
  });

  it("keeps only the handle when words follow it", () => {
    expect(parseSearchQuery("@abonten hub events").handle).toBe("abonten");
  });

  it("has no handle for a bare @", () => {
    const parsed = parseSearchQuery("@");
    expect(parsed.kind).toBe("organizer");
    expect(parsed.handle).toBeNull();
    expect(isSearchableQuery(parsed)).toBe(false);
  });

  it("does not treat an @ inside the text as organizer mode", () => {
    expect(parseSearchQuery("jazz @ labadi").kind).toBe("text");
  });

  it("classifies empty and text queries", () => {
    expect(parseSearchQuery("   ").kind).toBe("empty");
    expect(parseSearchQuery("gym").kind).toBe("text");
  });

  it("requires two characters for text and one for a handle", () => {
    expect(isSearchableQuery(parseSearchQuery("j"))).toBe(false);
    expect(isSearchableQuery(parseSearchQuery("ja"))).toBe(true);
    expect(isSearchableQuery(parseSearchQuery("@k"))).toBe(true);
  });

  it("accepts non-Latin letters in handles", () => {
    expect(parseSearchQuery("@ɔdɔ").handle).toBe("ɔdɔ");
  });
});
