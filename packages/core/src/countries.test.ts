import { describe, expect, it } from "vitest";
import { countryForCode, matchCountry, phoneCountries } from "./countries";
import { countryName } from "./geo/countries";

describe("country names in the reader's language", () => {
  it("names a country in the language asked for", () => {
    expect(countryName("DE")).toBe("Germany");
    expect(countryName("DE", "en")).toBe("Germany");
    expect(countryName("DE", "fr")).toBe("Allemagne");
    expect(countryName("DE", "es")).toBe("Alemania");
    expect(countryName("DE", "de")).toBe("Deutschland");
    expect(countryName("DE", "pt")).toBe("Alemanha");
    expect(countryName("GH", "ak")).toBe("Gaana");
  });

  it("keeps the English name where the language says the same", () => {
    expect(countryName("GH", "fr")).toBe("Ghana");
    expect(countryName("ZZ", "fr")).toBe("ZZ");
  });

  it("gives the picker a list named and sorted in that language", () => {
    const french = phoneCountries(["GH"], "fr");
    expect(french[0]).toMatchObject({ countryCode: "GH", name: "Ghana" });
    const names = french.slice(1).map((c) => c.name);
    expect(names).toContain("Allemagne");
    expect(names).not.toContain("Germany");
    // Alphabetical in French: accents do not push "États-Unis" to the end.
    expect(names.indexOf("États-Unis")).toBeLessThan(names.indexOf("Fidji"));
    expect(names.indexOf("Espagne")).toBeLessThan(names.indexOf("États-Unis"));
  });

  it("names the selected country in the reader's language", () => {
    expect(countryForCode("de", "fr")?.name).toBe("Allemagne");
    expect(countryForCode("de")?.name).toBe("Germany");
    expect(countryForCode(null, "fr")).toBeNull();
  });
});

describe("searching the country picker", () => {
  const french = phoneCountries(["GH", "NG"], "fr");

  it("finds a country by its name in the reader's language or in English", () => {
    expect(matchCountry("allem", french).map((c) => c.countryCode)).toEqual([
      "DE",
    ]);
    expect(matchCountry("germ", french).map((c) => c.countryCode)).toEqual([
      "DE",
    ]);
  });

  it("ignores accents and case", () => {
    expect(matchCountry("etats", french).map((c) => c.countryCode)).toContain(
      "US",
    );
    expect(matchCountry("ÉTATS", french).map((c) => c.countryCode)).toContain(
      "US",
    );
  });

  it("finds a country by dial code or ISO code", () => {
    expect(matchCountry("+233", french)[0]?.countryCode).toBe("GH");
    expect(matchCountry("233", french)[0]?.countryCode).toBe("GH");
    expect(matchCountry("ng", french).map((c) => c.countryCode)).toContain(
      "NG",
    );
  });

  it("keeps the open markets on top while someone types", () => {
    // Both Ghana and Nigeria contain "a"; they were listed first and stay so.
    const codes = matchCountry("a", french).map((c) => c.countryCode);
    expect(codes.slice(0, 2)).toEqual(["GH", "NG"]);
    expect(matchCountry("", french)).toHaveLength(french.length);
  });
});
