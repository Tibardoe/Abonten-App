import { describe, expect, it } from "vitest";
import {
  EXPLORE_PLACES_AROUND_YOU_KM,
  EXPLORE_PLACES_RADIUS_KM,
  explorePlaceSectionArgs,
  splitExplorePlaceSections,
} from "./explorePlaceSections";

const NO_FILTERS = {
  categoryId: null,
  minRating: null,
  openNow: false,
  maxDistanceKm: null,
};

describe("explorePlaceSectionArgs", () => {
  it("browses the default area and leaves unset filters out", () => {
    const args = explorePlaceSectionArgs({
      lat: 5.6,
      lng: -0.19,
      filters: NO_FILTERS,
    });
    expect(args).toMatchObject({
      p_user_lat: 5.6,
      p_user_lng: -0.19,
      p_radius_km: EXPLORE_PLACES_RADIUS_KM,
      p_around_km: EXPLORE_PLACES_AROUND_YOU_KM,
      p_top_rated_min: 4,
    });
    expect(args.p_category_id).toBeUndefined();
    expect(args.p_min_rating).toBeUndefined();
    expect(args.p_open_now).toBeUndefined();
  });

  it("narrows the area and 'Around you' with a chosen distance", () => {
    const args = explorePlaceSectionArgs({
      lat: 5.6,
      lng: -0.19,
      filters: { ...NO_FILTERS, maxDistanceKm: 2 },
    });
    expect(args.p_radius_km).toBe(2);
    expect(args.p_around_km).toBe(2);
  });

  it("passes the reader's filters and no point when the address had none", () => {
    const args = explorePlaceSectionArgs({
      lat: null,
      lng: null,
      filters: {
        categoryId: 3,
        minRating: 4.5,
        openNow: true,
        maxDistanceKm: null,
      },
    });
    expect(args.p_user_lat).toBeUndefined();
    expect(args.p_user_lng).toBeUndefined();
    expect(args.p_category_id).toBe(3);
    expect(args.p_min_rating).toBe(4.5);
    expect(args.p_open_now).toBe(true);
  });
});

describe("splitExplorePlaceSections", () => {
  it("puts each place in every row it belongs to, in that row's order", () => {
    const rows = [
      { id: "a", sections: { aroundYou: 2, topRated: 1 } },
      { id: "b", sections: { aroundYou: 1, openNow: 1 } },
      { id: "c", sections: { topRated: 2 } },
      { id: "d", sections: null },
      { id: "e", sections: { openNow: "1" } },
    ];
    const out = splitExplorePlaceSections(rows);
    expect(out.aroundYou.map((r) => r.id)).toEqual(["b", "a"]);
    expect(out.openNow.map((r) => r.id)).toEqual(["b"]);
    expect(out.topRated.map((r) => r.id)).toEqual(["a", "c"]);
  });
});
