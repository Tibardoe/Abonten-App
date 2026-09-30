import { describe, expect, it } from "vitest";
import {
  type CoverageMarket,
  type CoverageRegion,
  areaCoverage,
  coarsePoint,
  containingRegion,
  nearestLaunchedRegion,
  roundedDistanceKm,
  waitlistAreaKey,
} from "./coverage";
import { notLaunchedTitle, waitingText } from "./coverageCopy";

const accra: CoverageRegion = {
  id: "r-accra",
  slug: "accra",
  name: "Accra",
  lat: 5.6037,
  lng: -0.187,
  radiusKm: 30,
  status: "active",
  launchStatus: "launched",
};
const kumasi: CoverageRegion = {
  id: "r-kumasi",
  slug: "kumasi",
  name: "Kumasi",
  lat: 6.6885,
  lng: -1.6244,
  radiusKm: 25,
  status: "active",
  launchStatus: "coming_soon",
};
const capeCoast: CoverageRegion = {
  id: "r-cape-coast",
  slug: "cape-coast",
  name: "Cape Coast",
  lat: 5.1053,
  lng: -1.2466,
  radiusKm: 20,
  status: "active",
  launchStatus: "launched",
};

function ghana(
  overrides: Partial<CoverageMarket> = {},
  regions: CoverageRegion[] = [accra, kumasi, capeCoast],
): CoverageMarket {
  return {
    countryCode: "GH",
    coverageMode: "everywhere",
    regions,
    ...overrides,
  };
}

const KUMASI_CENTRE = { lat: 6.69, lng: -1.62 };
const ADUM = { lat: 6.6936, lng: -1.6266 }; // central Kumasi
const HO = { lat: 6.6008, lng: 0.4713 }; // Volta, outside every listed city
const OSU = { lat: 5.556, lng: -0.1823 };

describe("areaCoverage", () => {
  it("is open everywhere with the defaults (every city launched, mode everywhere)", () => {
    const allLaunched = ghana({}, [
      accra,
      { ...kumasi, launchStatus: "launched" },
      capeCoast,
    ]);
    for (const point of [OSU, ADUM, HO]) {
      expect(
        areaCoverage({ markets: [allLaunched], marketCountry: "GH", point })
          .kind,
      ).toBe("open");
    }
  });

  it("treats answers cached before the feature (no launch fields) as open", () => {
    const legacy: CoverageMarket = {
      countryCode: "GH",
      regions: [accra, kumasi].map(({ launchStatus, ...r }) => r),
    };
    expect(
      areaCoverage({ markets: [legacy], marketCountry: "GH", point: ADUM })
        .kind,
    ).toBe("open");
  });

  it("says a coming-soon city is not launched and offers the nearest launched city", () => {
    const result = areaCoverage({
      markets: [ghana()],
      marketCountry: "GH",
      point: ADUM,
    });
    expect(result.kind).toBe("not_launched");
    if (result.kind !== "not_launched") return;
    expect(result.region?.slug).toBe("kumasi");
    expect(result.countryCode).toBe("GH");
    // Cape Coast (~180 km) is nearer to Kumasi than Accra (~200 km).
    expect(result.nearest?.region.slug).toBe("cape-coast");
    expect(result.nearest?.distanceKm).toBeGreaterThan(150);
  });

  it("keeps a launched city open inside a launched_areas market", () => {
    expect(
      areaCoverage({
        markets: [ghana({ coverageMode: "launched_areas" })],
        marketCountry: "GH",
        point: OSU,
      }),
    ).toEqual({ kind: "open", region: accra });
  });

  it("decides a point outside every city by the market's mode", () => {
    expect(
      areaCoverage({ markets: [ghana()], marketCountry: "GH", point: HO }).kind,
    ).toBe("open");
    const result = areaCoverage({
      markets: [ghana({ coverageMode: "launched_areas" })],
      marketCountry: "gh",
      point: HO,
    });
    expect(result.kind).toBe("not_launched");
    if (result.kind !== "not_launched") return;
    expect(result.region).toBeNull();
    expect(result.nearest?.region.slug).toBe("accra");
  });

  it("is open outside every city when the market is unknown", () => {
    expect(
      areaCoverage({
        markets: [ghana({ coverageMode: "launched_areas" })],
        marketCountry: null,
        point: HO,
      }).kind,
    ).toBe("open");
  });

  it("ignores inactive cities", () => {
    const hidden = { ...kumasi, status: "inactive" as const };
    expect(
      areaCoverage({
        markets: [ghana({}, [accra, hidden])],
        marketCountry: "GH",
        point: ADUM,
      }).kind,
    ).toBe("open");
  });

  it("has no nearest city when none is launched", () => {
    const result = areaCoverage({
      markets: [ghana({}, [kumasi])],
      marketCountry: "GH",
      point: ADUM,
    });
    expect(result.kind === "not_launched" && result.nearest).toBeNull();
  });
});

describe("containingRegion / nearestLaunchedRegion", () => {
  it("picks the closest centre when two cities overlap", () => {
    const wide = { ...accra, id: "r-wide", radiusKm: 300 };
    expect(containingRegion([ghana({}, [wide, kumasi])], ADUM)?.region.id).toBe(
      "r-kumasi",
    );
  });

  it("never offers the coming-soon city itself", () => {
    expect(
      nearestLaunchedRegion([ghana()], KUMASI_CENTRE, "r-kumasi")?.region.id,
    ).not.toBe("r-kumasi");
  });
});

describe("waiting-list keys", () => {
  it("uses the city for points inside one, the ~1 km cell outside", () => {
    expect(waitlistAreaKey(kumasi, ADUM)).toBe("region:r-kumasi");
    expect(waitlistAreaKey(null, HO)).toBe("point:6.60,0.47");
    expect(coarsePoint({ lat: 6.60499, lng: -1.62661 })).toEqual({
      lat: 6.6,
      lng: -1.63,
    });
  });
});

describe("copy", () => {
  it("names the area when it can, never 'Your location'", () => {
    expect(notLaunchedTitle("Kumasi")).toBe("Abonten isn't in Kumasi yet");
    expect(notLaunchedTitle(null)).toBe("Abonten isn't here yet");
    expect(waitingText(null)).toBe(
      "We'll tell you when Abonten launches here.",
    );
  });

  it("rounds distances to what a person would say", () => {
    expect(roundedDistanceKm(0.4)).toBe(1);
    expect(roundedDistanceKm(7.4)).toBe(7);
    expect(roundedDistanceKm(42)).toBe(40);
    expect(roundedDistanceKm(183)).toBe(180);
  });
});
