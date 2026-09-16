import { describe, expect, it } from "vitest";
import {
  SPOTLIGHT_MAX_SLIDES,
  buildSpotlightSlides,
  spotlightHeight,
} from "./spotlight";

const weekly = { scopeSlug: "accra", weekStart: "2026-09-14" };
const e = (id: string) => ({ id });
const p = (id: string) => ({ id });

describe("buildSpotlightSlides", () => {
  it("puts the Weekly edition first, then the tab's featured listings", () => {
    const slides = buildSpotlightSlides({
      tab: "events",
      weekly,
      featuredEvents: [e("a"), e("b")],
      featuredPlaces: [p("x")],
    });
    expect(slides.map((s) => s.key)).toEqual([
      "weekly:accra:2026-09-14",
      "event:a",
      "event:b",
    ]);
  });

  it("shows featured places on the places tab and keeps the edition", () => {
    const slides = buildSpotlightSlides({
      tab: "places",
      weekly,
      featuredEvents: [e("a")],
      featuredPlaces: [p("x"), p("y")],
    });
    expect(slides.map((s) => s.kind)).toEqual(["weekly", "place", "place"]);
  });

  it("is empty when there is nothing to spotlight", () => {
    expect(
      buildSpotlightSlides({
        tab: "events",
        weekly: null,
        featuredEvents: [],
        featuredPlaces: [p("x")],
      }),
    ).toEqual([]);
  });

  it("never repeats a listing", () => {
    const slides = buildSpotlightSlides({
      tab: "events",
      weekly: null,
      featuredEvents: [e("a"), e("a"), e("b")],
      featuredPlaces: [],
    });
    expect(slides.map((s) => s.key)).toEqual(["event:a", "event:b"]);
  });

  it("caps the number of slides, edition included", () => {
    const many = Array.from({ length: 20 }, (_, i) => e(String(i)));
    const slides = buildSpotlightSlides({
      tab: "events",
      weekly,
      featuredEvents: many,
      featuredPlaces: [],
    });
    expect(slides).toHaveLength(SPOTLIGHT_MAX_SLIDES);
    expect(slides[0].kind).toBe("weekly");
  });
});

describe("spotlightHeight", () => {
  it("scales with the window and stays within bounds", () => {
    expect(spotlightHeight(393)).toBe(362);
    expect(spotlightHeight(300)).toBe(320);
    expect(spotlightHeight(1024)).toBe(440);
  });
});
