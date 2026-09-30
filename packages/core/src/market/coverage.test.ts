import { describe, expect, it } from "vitest";
import {
  type BrowseFallback,
  type CoverageMarket,
  type CoverageRegion,
  areaCoverage,
  browseSuggestions,
  coarsePoint,
  containingRegion,
  normalizeBrowseFallback,
  roundedDistanceKm,
  waitlistAreaKey,
} from "./coverage";
import {
  browseReasonLabel,
  cityDistanceText,
  notLaunchedTitle,
  waitingText,
} from "./coverageCopy";

const accra: CoverageRegion = {
  id: "r-accra",
  slug: "accra",
  name: "Accra",
  lat: 5.6037,
  lng: -0.187,
  radiusKm: 30,
  status: "active",
  launchStatus: "launched",
  position: 1,
  activity: { upcomingEvents: 6, places: 0 },
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
  position: 2,
};
const takoradi: CoverageRegion = {
  id: "r-takoradi",
  slug: "takoradi",
  name: "Takoradi",
  lat: 4.8845,
  lng: -1.7554,
  radiusKm: 20,
  status: "active",
  launchStatus: "launched",
  position: 3,
  activity: { upcomingEvents: 0, places: 0 },
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
  position: 5,
  activity: { upcomingEvents: 1, places: 0 },
};

function ghana(
  overrides: Partial<CoverageMarket> = {},
  regions: CoverageRegion[] = [accra, kumasi, capeCoast],
): CoverageMarket {
  return {
    countryCode: "GH",
    status: "live",
    coverageMode: "everywhere",
    regions,
    ...overrides,
  };
}

function withFallback(
  fallback: Partial<BrowseFallback>,
  regions?: CoverageRegion[],
): CoverageMarket {
  return ghana({ browseFallback: fallback }, regions);
}

const KUMASI_CENTRE = { lat: 6.69, lng: -1.62 };
const ADUM = { lat: 6.6936, lng: -1.6266 }; // central Kumasi
const HO = { lat: 6.6008, lng: 0.4713 }; // Volta, outside every listed city
const OSU = { lat: 5.556, lng: -0.1823 };
const LAGOS = { lat: 6.5244, lng: 3.3792 };

function browseFromKumasi(
  market: CoverageMarket,
  extra: CoverageMarket[] = [],
) {
  return browseSuggestions({
    markets: [market, ...extra],
    point: ADUM,
    countryCode: "GH",
    excludeRegionId: "r-kumasi",
  });
}

const names = (b: ReturnType<typeof browseSuggestions>) =>
  b.cities.map((c) => c.region.name);

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

  it("says a coming-soon city is not launched and lists other cities to explore", () => {
    const result = areaCoverage({
      markets: [ghana()],
      marketCountry: "GH",
      point: ADUM,
    });
    expect(result.kind).toBe("not_launched");
    if (result.kind !== "not_launched") return;
    expect(result.region?.slug).toBe("kumasi");
    expect(result.countryCode).toBe("GH");
    // Default: let people choose, nearest first, never Kumasi itself.
    expect(result.browse.strategy).toBe("choose");
    expect(result.browse.reason).toBeNull();
    expect(names(result.browse)).toEqual(["Cape Coast", "Accra"]);
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
    expect(names(result.browse)[0]).toBe("Accra");
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
});

describe("browseSuggestions — strategies", () => {
  it("choose: a short list, nearest first, cut to the market's limit", () => {
    const b = browseFromKumasi(
      withFallback({ strategy: "choose", limit: 2 }, [
        accra,
        kumasi,
        capeCoast,
        takoradi,
      ]),
    );
    expect(b).toMatchObject({ strategy: "choose", reason: null });
    expect(names(b)).toEqual(["Cape Coast", "Accra"]);
    expect(b.cities[0].distanceKm).toBeLessThan(b.cities[1].distanceKm);
  });

  it("nearest: the closest launched city, marked as the nearest", () => {
    const b = browseFromKumasi(withFallback({ strategy: "nearest" }));
    expect(b).toMatchObject({ strategy: "nearest", reason: "nearest" });
    expect(names(b)).toEqual(["Cape Coast"]);
  });

  it("most_active: most upcoming events + places; ties go to the nearer city", () => {
    const b = browseFromKumasi(withFallback({ strategy: "most_active" }));
    expect(b).toMatchObject({ strategy: "most_active", reason: "most_active" });
    expect(names(b)).toEqual(["Accra"]); // 6 listings against Cape Coast's 1

    const tie = browseFromKumasi(
      withFallback({ strategy: "most_active" }, [
        { ...accra, activity: { upcomingEvents: 1, places: 2 } },
        kumasi,
        { ...capeCoast, activity: { upcomingEvents: 3, places: 0 } },
      ]),
    );
    expect(names(tie)).toEqual(["Cape Coast"]);

    const placesCount = browseFromKumasi(
      withFallback({ strategy: "most_active" }, [
        { ...accra, activity: { upcomingEvents: 0, places: 9 } },
        kumasi,
        capeCoast,
      ]),
    );
    expect(names(placesCount)).toEqual(["Accra"]);
  });

  it("most_active: with no listings anywhere (or unknown counts), the nearest", () => {
    const empty = browseFromKumasi(
      withFallback({ strategy: "most_active" }, [
        { ...accra, activity: { upcomingEvents: 0, places: 0 } },
        kumasi,
        { ...capeCoast, activity: null },
      ]),
    );
    expect(empty).toMatchObject({ strategy: "nearest", reason: "nearest" });
    expect(names(empty)).toEqual(["Cape Coast"]);
  });

  it("fixed: the chosen city, marked as suggested", () => {
    const b = browseFromKumasi(
      withFallback({ strategy: "fixed", regionId: "r-accra" }),
    );
    expect(b).toMatchObject({ strategy: "fixed", reason: "recommended" });
    expect(names(b)).toEqual(["Accra"]);
  });

  it("fixed: falls back to the nearest when the chosen city is not launched, inactive or gone", () => {
    for (const regions of [
      [{ ...accra, launchStatus: "coming_soon" as const }, kumasi, capeCoast],
      [{ ...accra, status: "inactive" as const }, kumasi, capeCoast],
      [kumasi, capeCoast],
    ]) {
      const b = browseFromKumasi(
        withFallback({ strategy: "fixed", regionId: "r-accra" }, regions),
      );
      expect(b.strategy).toBe("nearest");
      expect(names(b)).toEqual(["Cape Coast"]);
    }
  });
});

describe("browseSuggestions — edge cases", () => {
  it("never offers a city that is not launched, whatever the strategy", () => {
    const comingSoonAccra = { ...accra, launchStatus: "coming_soon" as const };
    for (const strategy of [
      "choose",
      "nearest",
      "most_active",
      "fixed",
    ] as const) {
      const b = browseFromKumasi(
        withFallback({ strategy, regionId: "r-accra", limit: 5 }, [
          comingSoonAccra,
          kumasi,
          capeCoast,
          { ...takoradi, status: "inactive" },
        ]),
      );
      expect(names(b)).toEqual(["Cape Coast"]);
    }
  });

  it("offers no city from a market that is not live", () => {
    const b = browseFromKumasi(ghana({ status: "maintenance" }));
    expect(b.cities).toEqual([]);
  });

  it("with one launched city, shows it without a reason", () => {
    for (const strategy of [
      "choose",
      "nearest",
      "most_active",
      "fixed",
    ] as const) {
      const b = browseFromKumasi(
        withFallback({ strategy, regionId: "r-accra" }, [accra, kumasi]),
      );
      expect(names(b)).toEqual(["Accra"]);
      expect(b.reason).toBeNull();
    }
  });

  it("with no launched city anywhere, offers nothing", () => {
    const b = browseFromKumasi(ghana({}, [kumasi]));
    expect(b.cities).toEqual([]);
  });

  it("falls back to the nearest launched city of another live market", () => {
    const nigeria: CoverageMarket = {
      countryCode: "NG",
      status: "live",
      regions: [
        {
          id: "r-lagos",
          slug: "lagos",
          name: "Lagos",
          lat: LAGOS.lat,
          lng: LAGOS.lng,
          radiusKm: 40,
          status: "active",
          launchStatus: "launched",
        },
      ],
    };
    const b = browseFromKumasi(ghana({}, [kumasi]), [nigeria]);
    expect(b).toMatchObject({ strategy: "nearest", reason: "nearest" });
    expect(names(b)).toEqual(["Lagos"]);
    // With launched cities at home, another country is never offered.
    expect(names(browseFromKumasi(ghana(), [nigeria]))).not.toContain("Lagos");
  });

  it("offers a duplicated city once", () => {
    const copy = {
      ...accra,
      id: "r-accra-2",
      slug: "accra-2",
      name: " accra ",
    };
    const b = browseFromKumasi(
      withFallback({ strategy: "choose", limit: 5 }, [accra, copy, kumasi]),
    );
    expect(names(b)).toEqual(["Accra"]);
  });

  it("resets an unknown or out-of-range configuration to the default", () => {
    expect(normalizeBrowseFallback(null)).toEqual({
      strategy: "choose",
      regionId: null,
      limit: 3,
    });
    expect(
      normalizeBrowseFallback({
        strategy: "random" as never,
        limit: 40,
        regionId: "",
      }),
    ).toEqual({ strategy: "choose", regionId: null, limit: 5 });
    expect(normalizeBrowseFallback({ limit: 1 }).limit).toBe(2);
  });
});

describe("containingRegion", () => {
  it("picks the closest centre when two cities overlap", () => {
    const wide = { ...accra, id: "r-wide", radiusKm: 300 };
    expect(containingRegion([ghana({}, [wide, kumasi])], ADUM)?.region.id).toBe(
      "r-kumasi",
    );
    expect(containingRegion([ghana()], KUMASI_CENTRE)?.region.id).toBe(
      "r-kumasi",
    );
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

  it("labels a single recommendation by why it was picked", () => {
    expect(browseReasonLabel("nearest")).toBe("Nearest");
    expect(browseReasonLabel("most_active")).toBe("Most listings");
    expect(browseReasonLabel("recommended")).toBe("Suggested");
    expect(browseReasonLabel(null)).toBeNull();
  });

  it("rounds distances to what a person would say", () => {
    expect(roundedDistanceKm(0.4)).toBe(1);
    expect(roundedDistanceKm(7.4)).toBe(7);
    expect(roundedDistanceKm(42)).toBe(40);
    expect(roundedDistanceKm(183)).toBe(180);
    const b = browseFromKumasi(withFallback({ strategy: "nearest" }));
    expect(cityDistanceText(b.cities[0])).toBe("180 km away");
  });
});
