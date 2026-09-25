import { describe, expect, it } from "vitest";
import {
  EMPTY_SEARCH_FILTERS,
  type SearchFilters,
  activeSearchFilters,
  canBrowseWithoutQuery,
  clearSearchFilter,
  clearSearchFiltersFor,
  describeSearchFilters,
  searchFiltersFor,
  searchFiltersFromParams,
  searchFiltersToParams,
  searchFiltersToRequest,
  searchWhenWindow,
} from "./searchFilters";

const ACCRA = { lat: 5.6037, lng: -0.187 };
// Wednesday 2026-09-16 14:37 UTC (= Accra time).
const NOW = new Date("2026-09-16T14:37:12Z");

const full: SearchFilters = {
  when: "weekend",
  radiusKm: 10,
  price: "free",
  eventCategory: "Food & Drink",
  placeCategoryId: 3,
  placeCategoryName: "Restaurants",
  openNow: true,
  minRating: 4,
};

describe("which filters a tab offers", () => {
  it("offers event filters on Events, place filters on Places, shared ones on All, none for organizers", () => {
    expect(searchFiltersFor("events")).toEqual([
      "when",
      "radiusKm",
      "price",
      "eventCategory",
      "minRating",
    ]);
    expect(searchFiltersFor("places")).toEqual([
      "radiusKm",
      "placeCategoryId",
      "openNow",
      "minRating",
    ]);
    expect(searchFiltersFor("organizers")).toEqual([]);
    expect(searchFiltersFor("all")).toHaveLength(7);
  });

  it("counts only filters that apply to the tab", () => {
    expect(activeSearchFilters(full, "places")).toEqual([
      "radiusKm",
      "placeCategoryId",
      "openNow",
      "minRating",
    ]);
    expect(activeSearchFilters(EMPTY_SEARCH_FILTERS, "all")).toEqual([]);
  });
});

describe("searchFiltersToRequest", () => {
  it("never sends a filter to a tab it does not apply to", () => {
    const places = searchFiltersToRequest(full, "places", NOW, ACCRA);
    expect(places).toMatchObject({
      placeCategoryId: 3,
      openNow: true,
      minRating: 4,
      radiusKm: 10,
    });
    expect(places.category).toBeUndefined();
    expect(places.startDate).toBeUndefined();
    expect(places.maxPrice).toBeUndefined();

    const events = searchFiltersToRequest(full, "events", NOW, ACCRA);
    expect(events).toMatchObject({
      category: "Food & Drink",
      minPrice: 0,
      maxPrice: 0,
    });
    expect(events.openNow).toBeUndefined();
    expect(events.placeCategoryId).toBeUndefined();
  });

  it("sends distance only with a location to measure from", () => {
    expect(searchFiltersToRequest(full, "events", NOW, null).radiusKm).toBe(
      undefined,
    );
  });

  it("keeps the request stable within the hour (a stable cache key)", () => {
    const a = searchFiltersToRequest(full, "events", NOW, ACCRA);
    const b = searchFiltersToRequest(
      full,
      "events",
      new Date("2026-09-16T14:59:59Z"),
      ACCRA,
    );
    expect(a).toEqual(b);
  });
});

describe("searchWhenWindow", () => {
  it("reads 'this weekend' as Friday 17:00 to Monday", () => {
    expect(searchWhenWindow("weekend", NOW)).toEqual({
      startDate: "2026-09-18T17:00:00.000Z",
      endDate: "2026-09-21T00:00:00.000Z",
    });
  });

  it("uses the weekend under way on a Saturday, from now", () => {
    expect(
      searchWhenWindow("weekend", new Date("2026-09-19T10:20:00Z")),
    ).toEqual({
      startDate: "2026-09-19T10:00:00.000Z",
      endDate: "2026-09-21T00:00:00.000Z",
    });
  });

  it("covers today and tomorrow as calendar days", () => {
    expect(searchWhenWindow("today", NOW)?.endDate).toBe(
      "2026-09-17T00:00:00.000Z",
    );
    expect(searchWhenWindow("tomorrow", NOW)).toEqual({
      startDate: "2026-09-17T00:00:00.000Z",
      endDate: "2026-09-18T00:00:00.000Z",
    });
    expect(searchWhenWindow("any", NOW)).toBeNull();
  });
});

describe("clearing", () => {
  it("clears one filter, or only the current tab's", () => {
    expect(clearSearchFilter(full, "placeCategoryId")).toMatchObject({
      placeCategoryId: null,
      placeCategoryName: null,
    });
    const cleared = clearSearchFiltersFor(full, "places");
    expect(cleared.openNow).toBe(false);
    expect(cleared.when).toBe("weekend"); // an Events filter survives
  });
});

describe("chips", () => {
  it("labels active filters, with the location for distance", () => {
    expect(describeSearchFilters(full, "places", "Osu", "GHS")).toEqual([
      { key: "radiusKm", label: "Within 10 km of Osu" },
      { key: "placeCategoryId", label: "Restaurants" },
      { key: "openNow", label: "Open now" },
      { key: "minRating", label: "4+ stars" },
    ]);
  });
});

describe("browsing without text", () => {
  it("allows a category on its own tab", () => {
    expect(canBrowseWithoutQuery(full, "events")).toBe(true);
    expect(canBrowseWithoutQuery(EMPTY_SEARCH_FILTERS, "events")).toBe(false);
    expect(
      canBrowseWithoutQuery(
        { ...EMPTY_SEARCH_FILTERS, openNow: true },
        "places",
      ),
    ).toBe(false);
  });
});

describe("link params", () => {
  it("round-trips and ignores junk", () => {
    expect(searchFiltersFromParams(searchFiltersToParams(full))).toEqual(full);
    expect(
      searchFiltersFromParams({
        when: "someday",
        km: "7",
        rating: "9",
        pcat: "x",
      }),
    ).toEqual(EMPTY_SEARCH_FILTERS);
  });
});
