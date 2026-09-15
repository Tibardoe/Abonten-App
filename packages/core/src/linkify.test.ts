import { describe, expect, it } from "vitest";
import { hasLink, isSafeWebUrl, linkify } from "./linkify";

function joined(text: string): string {
  return linkify(text)
    .map((s) => s.text)
    .join("");
}

describe("linkify", () => {
  it("returns plain text untouched", () => {
    expect(linkify("hello there")).toEqual([
      { type: "text", text: "hello there" },
    ]);
    expect(linkify("")).toEqual([]);
  });

  it("finds an https link and keeps the surrounding text", () => {
    expect(linkify("see https://abontenhub.com/weekly now")).toEqual([
      { type: "text", text: "see " },
      {
        type: "link",
        text: "https://abontenhub.com/weekly",
        href: "https://abontenhub.com/weekly",
      },
      { type: "text", text: " now" },
    ]);
  });

  it("prefixes https on a bare www host without changing the text", () => {
    const [seg] = linkify("www.abontenhub.com");
    expect(seg).toEqual({
      type: "link",
      text: "www.abontenhub.com",
      href: "https://www.abontenhub.com",
    });
  });

  it("leaves sentence punctuation out of the link", () => {
    const segs = linkify(
      "Go to https://abontenhub.com/weekly/ghana. Then reply!",
    );
    expect(segs[1]).toEqual({
      type: "link",
      text: "https://abontenhub.com/weekly/ghana",
      href: "https://abontenhub.com/weekly/ghana",
    });
    expect(segs[2]).toEqual({ type: "text", text: ". Then reply!" });
  });

  it("drops an unbalanced closing bracket but keeps a balanced one", () => {
    expect(linkify("(https://a.com/x)")[1]).toMatchObject({
      text: "https://a.com/x",
    });
    expect(linkify("https://en.wikipedia.org/wiki/Foo_(bar)")[0]).toMatchObject(
      { text: "https://en.wikipedia.org/wiki/Foo_(bar)" },
    );
  });

  it("never links non-web schemes or dotless hosts", () => {
    expect(linkify("javascript:alert(1)")).toEqual([
      { type: "text", text: "javascript:alert(1)" },
    ]);
    expect(linkify("http://localhost/admin")).toEqual([
      { type: "text", text: "http://localhost/admin" },
    ]);
    expect(isSafeWebUrl("data:text/html,hi")).toBe(false);
    expect(isSafeWebUrl("https://abontenhub.com")).toBe(true);
  });

  it("round-trips the original text exactly", () => {
    const samples = [
      "two links https://a.com and www.b.org/path?q=1, ok?",
      "https://abontenhub.com/weekly/ghana/2026-09-14 https://abontenhub.com/weekly/ghana/2026-09-14",
      "trailing https://x.io/",
      "no links here.",
    ];
    for (const s of samples) expect(joined(s)).toBe(s);
  });

  it("hasLink is a cheap pre-check", () => {
    expect(hasLink("plain")).toBe(false);
    expect(hasLink("see www.x.com")).toBe(true);
    expect(hasLink(null)).toBe(false);
    // Repeated calls must not be affected by the global regex state.
    expect(hasLink("see www.x.com")).toBe(true);
  });
});
