import { describe, expect, it } from "vitest";
import { formatTitle } from "./titleCase";

describe("formatTitle", () => {
  it("still normalises a shouted title", () => {
    expect(formatTitle("A SHOUTED TITLE ABOUT SHOES")).toBe(
      "A Shouted Title About Shoes",
    );
  });

  it("still capitalises a lower-case title", () => {
    expect(formatTitle("friday night at the beach")).toBe(
      "Friday Night At The Beach",
    );
  });

  // Regression: the old per-word transform lower-cased everything after the
  // first letter, so every acronym in a title was destroyed.
  it("keeps short acronyms as typed", () => {
    expect(formatTitle("DJ Night")).toBe("DJ Night");
    expect(formatTitle("VIP Gala")).toBe("VIP Gala");
    expect(formatTitle("VVIP Lounge")).toBe("VVIP Lounge");
    expect(formatTitle("MTN Pulse Party")).toBe("MTN Pulse Party");
    expect(formatTitle("AFCON Screening")).toBe("AFCON Screening");
  });

  it("keeps an acronym wrapped in punctuation", () => {
    expect(formatTitle("The (VIP) Room")).toBe("The (VIP) Room");
    expect(formatTitle("DJ! Night")).toBe("DJ! Night");
  });

  it("keeps intentional inner capitals", () => {
    expect(formatTitle("McCarthy Hill Sessions")).toBe(
      "McCarthy Hill Sessions",
    );
    expect(formatTitle("AfroBeats Live")).toBe("AfroBeats Live");
    expect(formatTitle("iPhone Giveaway")).toBe("iPhone Giveaway");
  });

  it("lower-cases a long all-caps word, which is shouting not an acronym", () => {
    expect(formatTitle("CONCERT")).toBe("Concert");
    expect(formatTitle("AMAZING SHOW")).toBe("Amazing Show");
  });

  it("leaves an empty string alone", () => {
    expect(formatTitle("")).toBe("");
  });

  it("does not collapse the spacing it was given", () => {
    expect(formatTitle("dj  night")).toBe("Dj  Night");
  });

  // A title with nothing but capitals reads as shouting, and there is no
  // signal left to say otherwise — so this one deliberately normalises.
  it("normalises a title that is nothing but capitals", () => {
    expect(formatTitle("VIP")).toBe("Vip");
  });

  it("normalises a long shouted word inside a mixed title", () => {
    expect(formatTitle("The AMAZING Show")).toBe("The Amazing Show");
  });
});
