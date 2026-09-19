import { describe, expect, it } from "vitest";
import {
  conceptProblem,
  normalizeConceptWord,
  parseConceptWords,
} from "./searchVocabulary";

describe("normalizeConceptWord", () => {
  it("lower-cases, trims and collapses spaces", () => {
    expect(normalizeConceptWord("  Chop   Bar ")).toBe("chop bar");
  });
});

describe("parseConceptWords", () => {
  it("splits on commas and new lines, dropping blanks, repeats and the term", () => {
    expect(
      parseConceptWords("Beans, plantain\n\nbeans ,Gob3, red  red", "gob3"),
    ).toEqual(["beans", "plantain", "red red"]);
  });

  it("returns nothing for empty text", () => {
    expect(parseConceptWords(" , \n ")).toEqual([]);
  });
});

describe("conceptProblem", () => {
  const ok = {
    term: "gob3",
    expandsTo: ["beans"],
    appliesTo: ["event", "place"],
  };

  it("accepts a normal concept", () => {
    expect(conceptProblem(ok)).toBeNull();
  });

  it("needs a term with a letter or number", () => {
    expect(conceptProblem({ ...ok, term: "  " })).toMatch(/Enter the term/);
    expect(conceptProblem({ ...ok, term: "&&" })).toMatch(/letter or number/);
  });

  it("needs between one and thirty words", () => {
    expect(conceptProblem({ ...ok, expandsTo: [] })).toMatch(/at least one/);
    expect(
      conceptProblem({
        ...ok,
        expandsTo: Array.from({ length: 31 }, (_, i) => `w${i}`),
      }),
    ).toMatch(/At most 30/);
  });

  it("needs known result types", () => {
    expect(conceptProblem({ ...ok, appliesTo: [] })).toMatch(/Choose/);
    expect(conceptProblem({ ...ok, appliesTo: ["ticket"] })).toMatch(/Unknown/);
  });
});
