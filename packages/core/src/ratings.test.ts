import { describe, expect, it } from "vitest";
import { EMPTY_RATING, parseRatingAggregate, roundRating } from "./ratings";

describe("parseRatingAggregate", () => {
  it("reads a normal aggregate row", () => {
    expect(
      parseRatingAggregate({ average_rating: 4.5, total_ratings: 12 }),
    ).toEqual({ average: 4.5, count: 12 });
  });

  it("accepts a numeric serialised as a string", () => {
    // PostgREST serialises `numeric` as a string when the value might not
    // survive a JS number exactly.
    expect(
      parseRatingAggregate({
        average_rating: "4.6666666666666667",
        total_ratings: 3,
      }),
    ).toEqual({ average: 14 / 3, count: 3 });
  });

  it("treats a missing row as no ratings", () => {
    expect(parseRatingAggregate(null)).toEqual(EMPTY_RATING);
    expect(parseRatingAggregate(undefined)).toEqual(EMPTY_RATING);
  });

  it("treats null columns as zero rather than NaN", () => {
    expect(
      parseRatingAggregate({ average_rating: null, total_ratings: null }),
    ).toEqual({ average: 0, count: 0 });
  });

  it("never returns NaN for an unparseable value", () => {
    const r = parseRatingAggregate({
      average_rating: "not-a-number",
      total_ratings: 2,
    });
    expect(Number.isNaN(r.average)).toBe(false);
    expect(r.average).toBe(0);
  });
});

describe("roundRating", () => {
  it("rounds to one decimal by default, matching the public surfaces", () => {
    expect(roundRating(14 / 3)).toBe(4.7);
    expect(roundRating(11 / 3)).toBe(3.7);
    expect(roundRating(4)).toBe(4);
  });

  it("rounds to two decimals for admin", () => {
    expect(roundRating(14 / 3, 2)).toBe(4.67);
  });

  it("keeps zero as zero, not -0 or 0.0 as a string", () => {
    expect(roundRating(0)).toBe(0);
    expect(Object.is(roundRating(0), 0)).toBe(true);
  });

  it("matches the arithmetic the JS aggregation used to do", () => {
    // The replaced code did (sum / count).toFixed(1) -> parseFloat.
    const ratings = [4, 5, 5];
    const legacy = Number.parseFloat(
      (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1),
    );
    expect(roundRating(14 / 3)).toBe(legacy);
  });
});
