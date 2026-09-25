import { describe, expect, it } from "vitest";
import {
  defaultDistanceUnit,
  formatDistance,
  metresToUnit,
  radiusOptions,
  unitToMetres,
} from "./distance";

describe("distance", () => {
  it("picks miles only where roads are signed in miles", () => {
    expect(defaultDistanceUnit("GH")).toBe("km");
    expect(defaultDistanceUnit("NG")).toBe("km");
    expect(defaultDistanceUnit("GB")).toBe("mi");
    expect(defaultDistanceUnit("US")).toBe("mi");
    expect(defaultDistanceUnit(null)).toBe("km");
  });

  it("formats in either unit", () => {
    expect(formatDistance(850)).toBe("850 m");
    expect(formatDistance(2400)).toBe("2.4 km");
    expect(formatDistance(12_400)).toBe("12 km");
    expect(formatDistance(800, "mi")).toBe("0.5 mi");
    expect(formatDistance(19_312, "mi")).toBe("12 mi");
    expect(formatDistance(100, "mi")).toBe("109 yd");
    expect(formatDistance(Number.NaN)).toBe("");
  });

  it("converts both ways", () => {
    expect(metresToUnit(1609.344, "mi")).toBeCloseTo(1);
    expect(unitToMetres(2, "km")).toBe(2000);
    expect(radiusOptions("km")).toHaveLength(10);
    expect(radiusOptions("mi")[0]).toEqual({
      label: "Up to 1 mi",
      metres: 1609,
    });
  });
});
