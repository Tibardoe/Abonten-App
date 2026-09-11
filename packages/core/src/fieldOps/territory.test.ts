import { describe, expect, it } from "vitest";
import {
  distanceMetres,
  isValidLatLng,
  pointInPolygon,
  territoryContains,
  validatePolygon,
} from "./territory";

const KUMASI = { lat: 6.6885, lng: -1.6244 };
const EJISU = { lat: 6.7208, lng: -1.3661 };
const ACCRA = { lat: 5.6037, lng: -0.187 };

// A rough box around Kumasi: [lng, lat] positions, closed.
const KUMASI_BOX = {
  type: "Polygon" as const,
  coordinates: [
    [
      [-1.75, 6.6],
      [-1.5, 6.6],
      [-1.5, 6.78],
      [-1.75, 6.78],
      [-1.75, 6.6],
    ] as [number, number][],
  ],
};

describe("distanceMetres", () => {
  it("is zero for the same point and symmetric", () => {
    expect(distanceMetres(KUMASI, KUMASI)).toBe(0);
    expect(distanceMetres(KUMASI, EJISU)).toBeCloseTo(
      distanceMetres(EJISU, KUMASI),
      6,
    );
  });

  it("matches known distances within a percent", () => {
    // Kumasi → Ejisu is about 28.7 km by great circle.
    expect(distanceMetres(KUMASI, EJISU)).toBeGreaterThan(28_000);
    expect(distanceMetres(KUMASI, EJISU)).toBeLessThan(29_500);
    // Kumasi → Accra is about 200 km.
    expect(distanceMetres(KUMASI, ACCRA)).toBeGreaterThan(195_000);
    expect(distanceMetres(KUMASI, ACCRA)).toBeLessThan(205_000);
  });
});

describe("territoryContains", () => {
  it("uses the circle when there is no boundary", () => {
    const t = { centre: KUMASI, radiusM: 5000, boundary: null };
    expect(territoryContains(t, { lat: 6.7, lng: -1.62 })).toBe(true);
    expect(territoryContains(t, EJISU)).toBe(false);
  });

  it("prefers the polygon when one is set, even if the circle disagrees", () => {
    const t = { centre: KUMASI, radiusM: 100, boundary: KUMASI_BOX };
    expect(territoryContains(t, { lat: 6.75, lng: -1.7 })).toBe(true);
    expect(territoryContains(t, EJISU)).toBe(false);
  });

  it("refuses invalid coordinates", () => {
    const t = { centre: KUMASI, radiusM: 5000, boundary: null };
    expect(territoryContains(t, { lat: Number.NaN, lng: 0 })).toBe(false);
    expect(territoryContains(t, { lat: 95, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: 181 })).toBe(false);
  });
});

describe("pointInPolygon", () => {
  it("handles points inside, outside and on a corner consistently", () => {
    expect(pointInPolygon({ lat: 6.7, lng: -1.6 }, KUMASI_BOX)).toBe(true);
    expect(pointInPolygon({ lat: 6.9, lng: -1.6 }, KUMASI_BOX)).toBe(false);
    expect(
      pointInPolygon(
        { lat: 6.7, lng: -1.6 },
        { type: "Polygon", coordinates: [] },
      ),
    ).toBe(false);
  });
});

describe("validatePolygon", () => {
  it("accepts a closed outer ring", () => {
    expect(validatePolygon(KUMASI_BOX)).toBeNull();
  });

  it("rejects the common mistakes with a message", () => {
    expect(validatePolygon(null)).toMatch(/GeoJSON Polygon/);
    expect(validatePolygon({ type: "Point", coordinates: [] })).toMatch(
      /GeoJSON Polygon/,
    );
    expect(
      validatePolygon({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      }),
    ).toMatch(/four positions/);
    expect(
      validatePolygon({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [1, 0],
            [0, 1],
          ],
        ],
      }),
    ).toMatch(/end where it starts/);
    expect(
      validatePolygon({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [200, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      }),
    ).toMatch(/longitude, latitude/);
  });
});
