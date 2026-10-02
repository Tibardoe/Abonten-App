import { describe, expect, it } from "vitest";
import { foldSearchText, foldedIncludes } from "./foldSearchText";

describe("foldSearchText", () => {
  it.each([
    ["Café Kwae", "cafe kwae"],
    ["SOIRÉE À la Plage", "soiree a la plage"],
    ["Ɔdehyeɛ kɔkɔɔ", "odehyee kokoo"],
    ["ABƆNTEN", "abonten"],
    ["Straße Müller", "strasse muller"],
    ["Œuvre Æther Søren Łódź", "oeuvre aether soren lodz"],
    ["São João, mañana", "sao joao, manana"],
    ["ŋma Ɖɔ Ƒe ʋu Ɣe", "nma do fe vu ge"],
    ["Ƙofar Ɓauchi Ɗan Ƴar", "kofar bauchi dan yar"],
    ["İstanbul ISTANBUL ıstanbul", "istanbul istanbul istanbul"],
  ])("%s -> %s", (input, expected) => {
    expect(foldSearchText(input)).toBe(expected);
  });

  it("gives the same answer for a letter and for a letter plus its accent", () => {
    // e + combining acute; o with dot below + combining acute; open o +
    // combining grave (neither has a single-letter form).
    expect(foldSearchText(`cafe${String.fromCodePoint(0x301)}`)).toBe("cafe");
    expect(
      foldSearchText(
        `${String.fromCodePoint(0x1ecd, 0x301)} ${String.fromCodePoint(0x254, 0x300)}`,
      ),
    ).toBe("o o");
  });

  it("makes curly quotes and long dashes plain", () => {
    expect(foldSearchText("Esi’s “Jam” – Live — Now")).toBe(
      'esi\'s "jam" - live - now',
    );
  });

  it("leaves digits, signs and other scripts alone", () => {
    expect(foldSearchText("gob3 & R&B 100%")).toBe("gob3 & r&b 100%");
    expect(foldSearchText("日本語 Привет")).toBe("日本語 привет");
  });

  it("is stable when applied twice", () => {
    const once = foldSearchText("Ɔdehyeɛ Café – Straße");
    expect(foldSearchText(once)).toBe(once);
  });
});

describe("foldedIncludes", () => {
  it("finds plain letters in an accented text and the other way round", () => {
    expect(foldedIncludes("États-Unis", "etats")).toBe(true);
    expect(foldedIncludes("Cote d'Ivoire", "CÔTE")).toBe(true);
    expect(foldedIncludes("Arts, culture et théâtre", "theatre")).toBe(true);
    expect(foldedIncludes("Musique et concerts", "sport")).toBe(false);
  });
});
