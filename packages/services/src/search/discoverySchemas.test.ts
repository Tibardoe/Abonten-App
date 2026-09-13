import {
  searchRequestSchema,
  subscribeSchema,
} from "@abonten/validation/discoverySchemas";
import { describe, expect, it } from "vitest";

// The /search page builds its request with explicit nulls for every filter
// that is not set; the mobile route sends query-string values. Both shapes
// must validate. (A null `types` once made every web search return 400,
// which the page then showed as "No results".)
describe("searchRequestSchema", () => {
  it("accepts the web page's request with null filters", () => {
    const parsed = searchRequestSchema.safeParse({
      q: "jazz",
      mode: "all",
      organizerId: null,
      category: null,
      types: null,
      minPrice: null,
      maxPrice: null,
      minRating: null,
      startDate: null,
      endDate: null,
      lat: null,
      lng: null,
      radiusKm: null,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.types).toBeUndefined();
  });

  it("coerces query-string values from the mobile route", () => {
    const parsed = searchRequestSchema.parse({
      q: "@kofi",
      mode: "organizers",
      lat: "5.6",
      lng: "-0.19",
      types: "Live Concerts, Parties",
      openNow: "true",
      pageSize: "20",
    });
    expect(parsed.lat).toBe(5.6);
    expect(parsed.types).toEqual(["Live Concerts", "Parties"]);
    expect(parsed.openNow).toBe(true);
    expect(parsed.pageSize).toBe(20);
  });

  it("rejects out-of-range values and unknown modes", () => {
    expect(searchRequestSchema.safeParse({ q: "x", lat: 91 }).success).toBe(
      false,
    );
    expect(
      searchRequestSchema.safeParse({ q: "x", mode: "people" }).success,
    ).toBe(false);
    expect(
      searchRequestSchema.safeParse({ q: "x", organizerId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });
});

describe("subscribeSchema", () => {
  it("only accepts sources a person can subscribe from directly", () => {
    const target = {
      kind: "organizer",
      organizerId: "00000000-0000-4000-8000-000000000001",
    };
    expect(
      subscribeSchema.safeParse({ target, source: "profile" }).success,
    ).toBe(true);
    expect(
      subscribeSchema.safeParse({ target, source: "purchase_prompt" }).success,
    ).toBe(false);
  });
});
