import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import type { WeeklyItem, WeeklySection } from "@abonten/types/weeklyType";
import { describe, expect, it } from "vitest";
import { weeklyBannerSlides } from "./bannerSlides";

function eventItem(
  id: string,
  over: Partial<UserPostType> = {},
  headline: string | null = null,
): WeeklyItem {
  return {
    id: `item-${id}`,
    position: 0,
    subjectType: "event",
    subjectId: `event-${id}`,
    headline,
    blurb: null,
    event: {
      id: `event-${id}`,
      title: `Event ${id}`,
      event_code: `EVT${id.toUpperCase()}`,
      flyer_public_id: `flyers/${id}`,
      flyer_version: "1",
      starts_at: "2026-09-19T19:00:00Z",
      ends_at: "2026-09-19T23:00:00Z",
      occurrences: null,
      ...over,
    } as unknown as UserPostType,
    place: null,
  };
}

function placeItem(id: string, over: Partial<PlaceType> = {}): WeeklyItem {
  return {
    id: `item-${id}`,
    position: 0,
    subjectType: "place",
    subjectId: `place-${id}`,
    headline: null,
    blurb: null,
    event: null,
    place: {
      id: `place-${id}`,
      name: `Place ${id}`,
      slug: `place-${id}`,
      category_name: "Restaurant",
      avg_rating: 4.56,
      cover_public_id: `covers/${id}`,
      cover_version: "2",
      ...over,
    } as unknown as PlaceType,
  };
}

function section(
  id: string,
  layout: WeeklySection["layout"],
  items: WeeklyItem[],
): WeeklySection {
  return {
    id,
    position: 0,
    kind: "curated",
    subjectScope: "mixed",
    layout,
    title: id,
    subtitle: null,
    iconKey: null,
    body: null,
    items,
  };
}

describe("weeklyBannerSlides", () => {
  it("puts hero sections first, then keeps the editor's order", () => {
    const slides = weeklyBannerSlides([
      section("a", "carousel", [eventItem("1"), placeItem("2")]),
      section("b", "hero", [eventItem("3")]),
    ]);
    expect(slides.map((s) => s.subjectId)).toEqual([
      "event-3",
      "event-1",
      "place-2",
    ]);
  });

  it("uses a listing once and skips listings without an image", () => {
    const slides = weeklyBannerSlides([
      section("a", "carousel", [
        eventItem("1"),
        eventItem("2", { flyer_public_id: null as unknown as string }),
        placeItem("3", { cover_public_id: null as unknown as string }),
      ]),
      section("b", "grid", [{ ...eventItem("1"), id: "item-dup" }]),
    ]);
    expect(slides.map((s) => s.key)).toEqual(["item-1"]);
  });

  it("stops at the limit", () => {
    const items = Array.from({ length: 9 }, (_, i) => eventItem(String(i)));
    expect(weeklyBannerSlides([section("a", "grid", items)])).toHaveLength(6);
    expect(weeklyBannerSlides([section("a", "grid", items)], 2)).toHaveLength(
      2,
    );
  });

  it("builds the caption and paths each client needs", () => {
    const [event, place] = weeklyBannerSlides([
      section("a", "carousel", [eventItem("x", {}, "Tonight"), placeItem("y")]),
    ]);
    expect(event).toMatchObject({
      subjectType: "event",
      title: "Event x",
      headline: "Tonight",
      publicId: "flyers/x",
      version: "1",
      webPath: "/events/evtx",
    });
    expect(event.meta).toMatch(/19 Sep/);
    expect(place).toMatchObject({
      subjectType: "place",
      meta: "Restaurant · 4.6 ★",
      webPath: "/places/place-y",
    });
  });

  it("leaves the rating out of a place caption when there is none", () => {
    const [place] = weeklyBannerSlides([
      section("a", "list", [placeItem("z", { avg_rating: null })]),
    ]);
    expect(place.meta).toBe("Restaurant");
  });
});
