import { describe, expect, it } from "vitest";
import { hasStrongMatch, scoreSimilarPlace } from "./duplicateScore";

const t = { radiusM: 300, similarityThreshold: 0.45 };

describe("scoreSimilarPlace", () => {
  it("treats a phone match as decisive", () => {
    expect(
      scoreSimilarPlace(
        { similarity: 0.1, distanceM: 5000, phoneMatch: true },
        t,
      ),
    ).toEqual({ score: 1, strong: true });
  });

  it("is strong for a similar name inside the radius", () => {
    const r = scoreSimilarPlace(
      { similarity: 0.8, distanceM: 40, phoneMatch: false },
      t,
    );
    expect(r.strong).toBe(true);
    expect(r.score).toBeGreaterThan(0.7);
  });

  it("discounts distance and never calls a far listing strong", () => {
    const near = scoreSimilarPlace(
      { similarity: 0.7, distanceM: 10, phoneMatch: false },
      t,
    );
    const edge = scoreSimilarPlace(
      { similarity: 0.7, distanceM: 290, phoneMatch: false },
      t,
    );
    const far = scoreSimilarPlace(
      { similarity: 0.7, distanceM: 2000, phoneMatch: false },
      t,
    );
    expect(near.score).toBeGreaterThan(edge.score);
    expect(edge.score).toBeGreaterThan(far.score);
    expect(far.strong).toBe(false);
    expect(near.strong).toBe(true);
  });

  it("needs at least 0.6 similarity to be strong even with a low threshold", () => {
    const r = scoreSimilarPlace(
      { similarity: 0.5, distanceM: 10, phoneMatch: false },
      { radiusM: 300, similarityThreshold: 0.3 },
    );
    expect(r.strong).toBe(false);
  });

  it("hasStrongMatch scans a list", () => {
    expect(
      hasStrongMatch(
        [
          { similarity: 0.2, distanceM: 10, phoneMatch: false },
          { similarity: 0.9, distanceM: 100, phoneMatch: false },
        ],
        t,
      ),
    ).toBe(true);
    expect(hasStrongMatch([], t)).toBe(false);
  });
});
