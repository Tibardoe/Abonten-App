import { describe, expect, it } from "vitest";
import { parseFilters } from "./parseFilterModalQueries";

describe("parseFilters", () => {
  it("returns nulls when no filter is set", () => {
    expect(parseFilters({})).toEqual({
      minPrice: null,
      maxPrice: null,
      minRating: null,
      maxDistanceKm: null,
      startDate: null,
      endDate: null,
      lat: null,
      lng: null,
    });
  });

  it("keeps distance in kilometres", () => {
    expect(parseFilters({ distance: "Up to 3km" }).maxDistanceKm).toBe(3);
  });

  it("treats the modal's full price range as no price filter", () => {
    const any = parseFilters({ price: "GHS 0 - GHS 999" });
    expect(any.minPrice).toBeNull();
    expect(any.maxPrice).toBeNull();
  });

  it("parses a real price range and an open upper bound", () => {
    expect(parseFilters({ price: "GHS 20 - GHS 250" })).toMatchObject({
      minPrice: 20,
      maxPrice: 250,
    });
    expect(parseFilters({ price: "GHS 50 - GHS 999" })).toMatchObject({
      minPrice: 50,
      maxPrice: 999999,
    });
  });

  it("parses rating and coordinates", () => {
    expect(
      parseFilters({ rating: "From 4.5", lat: "5.6", lng: "-0.18" }),
    ).toMatchObject({
      minRating: 4.5,
      lat: 5.6,
      lng: -0.18,
      maxDistanceKm: 20_000,
    });
  });
});
