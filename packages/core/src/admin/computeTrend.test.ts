import { describe, expect, it } from "vitest";
import {
  computeTrend,
  formatTrendPercent,
  trendDirection,
} from "./computeTrend";

describe("computeTrend", () => {
  it("has no opinion when there is nothing to compare against", () => {
    expect(computeTrend(10, null)).toEqual({ kind: "none" });
    expect(computeTrend(10, undefined)).toEqual({ kind: "none" });
    // Nothing happened either side: a 0% would imply it was measured.
    expect(computeTrend(0, 0)).toEqual({ kind: "none" });
  });

  it("says New rather than an infinite percentage", () => {
    expect(computeTrend(7, 0)).toEqual({ kind: "new" });
  });

  it("computes the change against the previous value", () => {
    expect(computeTrend(120, 100)).toEqual({ kind: "percent", value: 20 });
    expect(computeTrend(80, 100)).toEqual({ kind: "percent", value: -20 });
  });
});

describe("trendDirection", () => {
  it("treats a rounding wobble as flat", () => {
    expect(trendDirection(computeTrend(100.01, 100))).toBe("flat");
    expect(trendDirection(computeTrend(110, 100))).toBe("up");
    expect(trendDirection(computeTrend(90, 100))).toBe("down");
    expect(trendDirection(computeTrend(5, 0))).toBe("new");
    expect(trendDirection(computeTrend(5, null))).toBe("none");
  });
});

describe("formatTrendPercent", () => {
  it("always shows the sign and one decimal", () => {
    expect(formatTrendPercent(12.34)).toBe("+12.3%");
    // A real minus sign, not a hyphen.
    expect(formatTrendPercent(-8)).toBe("−8.0%");
    expect(formatTrendPercent(0)).toBe("0%");
  });
});
