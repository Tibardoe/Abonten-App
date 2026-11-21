import { describe, expect, it } from "vitest";
import {
  LINK_SOURCES,
  normalizeLinkSource,
  withLinkSource,
} from "./linkSources";

describe("link sources", () => {
  it("keeps only known codes, case and spaces aside", () => {
    expect(normalizeLinkSource("ig")).toBe("ig");
    expect(normalizeLinkSource(" IG ")).toBe("ig");
    expect(normalizeLinkSource("wa")).toBe("wa");
    expect(normalizeLinkSource("instagram")).toBeNull();
    expect(normalizeLinkSource("")).toBeNull();
    expect(normalizeLinkSource(null)).toBeNull();
    expect(normalizeLinkSource(7)).toBeNull();
  });

  it("matches the database's list", () => {
    // event_analytics_event_source_check / place_analytics_event_source_check
    // (migration 20261121230000) list the same codes.
    expect([...LINK_SOURCES]).toEqual(["ig", "x", "wa", "tt", "fb"]);
  });

  it("tags a link and keeps its other query", () => {
    expect(withLinkSource("https://abontenhub.com/events/abcd1234", "x")).toBe(
      "https://abontenhub.com/events/abcd1234?src=x",
    );
    expect(
      withLinkSource("https://abontenhub.com/events/abcd1234?hl=fr", "ig"),
    ).toBe("https://abontenhub.com/events/abcd1234?hl=fr&src=ig");
  });
});
