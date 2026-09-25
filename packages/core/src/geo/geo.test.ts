import { describe, expect, it } from "vitest";
import {
  addressFromGoogleComponents,
  readStructuredAddress,
  shortLocality,
} from "./address";
import { addressSchemaFor, validateAddress } from "./addressSchema";
import {
  COUNTRIES,
  countryName,
  findCountry,
  matchCountries,
  prioritiseCountries,
} from "./countries";
import { countryDefaults } from "./countryDefaults";

describe("countries", () => {
  it("has every country with a dial code and flag", () => {
    expect(COUNTRIES.length).toBeGreaterThan(240);
    expect(findCountry("gh")).toMatchObject({
      code: "GH",
      name: "Ghana",
      dialCode: "+233",
      flag: "🇬🇭",
    });
    expect(findCountry("XX")).toBeNull();
    expect(countryName("NG")).toBe("Nigeria");
    expect(countryName("ZZ")).toBe("ZZ");
  });

  it("searches by name, dial code and ISO code", () => {
    expect(matchCountries("gha").map((c) => c.code)).toContain("GH");
    expect(matchCountries("+23").map((c) => c.code)).toEqual(
      expect.arrayContaining(["GH", "NG"]),
    );
    expect(matchCountries("ke")[0]?.code).toBeDefined();
    expect(matchCountries("")).toHaveLength(COUNTRIES.length);
  });

  it("puts live markets first", () => {
    const ordered = prioritiseCountries(["GH", "NG"]);
    expect(ordered[0].code).toBe("GH");
    expect(ordered[1].code).toBe("NG");
    expect(ordered[2].name < ordered[3].name).toBe(true);
  });

  it("has verified defaults for the target markets", () => {
    expect(countryDefaults("GH")).toMatchObject({
      currency: "GHS",
      timeZone: "Africa/Accra",
      distanceUnit: "km",
    });
    expect(countryDefaults("NG")).toMatchObject({
      currency: "NGN",
      timeZone: "Africa/Lagos",
    });
    expect(countryDefaults("KE")).toMatchObject({
      currency: "KES",
      timeZone: "Africa/Nairobi",
    });
    expect(countryDefaults("GB")).toMatchObject({
      currency: "GBP",
      timeZone: "Europe/London",
      distanceUnit: "mi",
    });
    expect(countryDefaults("US")).toMatchObject({
      currency: "USD",
      distanceUnit: "mi",
    });
    expect(countryDefaults("FR")).toMatchObject({
      currency: "EUR",
      timeZone: "Europe/Paris",
    });
    expect(countryDefaults("CI")).toMatchObject({ currency: "XOF" });
    expect(countryDefaults("AQ")).toBeNull();
  });
});

describe("addresses", () => {
  it("reads legacy and structured JSON", () => {
    expect(readStructuredAddress({ full_address: "Osu, Accra" })).toEqual({
      full_address: "Osu, Accra",
    });
    expect(readStructuredAddress("Osu, Accra")).toEqual({
      full_address: "Osu, Accra",
    });
    expect(readStructuredAddress(null)).toEqual({ full_address: "" });
    expect(
      readStructuredAddress({
        full_address: "x",
        country_code: "gh",
        city: " Accra ",
        region: "",
        junk: 1,
      }),
    ).toEqual({ full_address: "x", country_code: "GH", city: "Accra" });
  });

  it("maps Google components for any country", () => {
    const london = addressFromGoogleComponents(
      "10 Downing St, London SW1A 2AA, UK",
      [
        { long_name: "10", short_name: "10", types: ["street_number"] },
        {
          long_name: "Downing Street",
          short_name: "Downing St",
          types: ["route"],
        },
        {
          long_name: "Westminster",
          short_name: "Westminster",
          types: ["sublocality_level_1", "sublocality"],
        },
        { long_name: "London", short_name: "London", types: ["postal_town"] },
        {
          long_name: "Greater London",
          short_name: "Greater London",
          types: ["administrative_area_level_2"],
        },
        {
          long_name: "England",
          short_name: "England",
          types: ["administrative_area_level_1"],
        },
        { long_name: "United Kingdom", short_name: "GB", types: ["country"] },
        {
          long_name: "SW1A 2AA",
          short_name: "SW1A 2AA",
          types: ["postal_code"],
        },
      ],
      "ChIJ",
    );
    expect(london).toMatchObject({
      country_code: "GB",
      city: "London",
      district: "Westminster",
      region: "England",
      postal_code: "SW1A 2AA",
      street: "10 Downing Street",
      place_id: "ChIJ",
    });
    expect(shortLocality(london)).toBe("Westminster, London");

    const accra = addressFromGoogleComponents("Oxford St, Accra, Ghana", [
      { long_name: "Oxford Street", short_name: "Oxford St", types: ["route"] },
      {
        long_name: "Osu",
        short_name: "Osu",
        types: ["sublocality_level_1", "sublocality"],
      },
      { long_name: "Accra", short_name: "Accra", types: ["locality"] },
      {
        long_name: "Greater Accra Region",
        short_name: "GA",
        types: ["administrative_area_level_1"],
      },
      { long_name: "Ghana", short_name: "GH", types: ["country"] },
    ]);
    expect(accra).toMatchObject({
      country_code: "GH",
      city: "Accra",
      district: "Osu",
      street: "Oxford Street",
    });
    expect(accra.postal_code).toBeNull();
    expect(shortLocality(accra)).toBe("Osu, Accra");
  });

  it("validates per country", () => {
    expect(
      addressSchemaFor("GH").fields.find((f) => f.key === "postal_code")
        ?.required,
    ).toBe(false);
    expect(
      addressSchemaFor("GB").fields.find((f) => f.key === "postal_code")
        ?.required,
    ).toBe(true);
    expect(addressSchemaFor(null)).toBe(addressSchemaFor("AQ"));
    expect(validateAddress({ city: "Accra" }, addressSchemaFor("GH"))).toEqual(
      [],
    );
    const gb = validateAddress(
      { street: "1 High St", city: "London", postal_code: "nope" },
      addressSchemaFor("GB"),
    );
    expect(gb.map((i) => i.key)).toEqual(["postal_code"]);
    expect(
      validateAddress(
        { street: "1 High St", city: "London", postal_code: "sw1a 1aa" },
        addressSchemaFor("GB"),
      ),
    ).toEqual([]);
    expect(
      validateAddress({}, addressSchemaFor("US")).map((i) => i.key),
    ).toEqual(["street", "city", "region", "postal_code"]);
  });
});
