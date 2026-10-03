import { describe, expect, it } from "vitest";
import { EMPTY_EVENT_FILTERS } from "./exploreFilters";
import {
  eventFilterArgs,
  eventFilterDateBounds,
  exploreEventSectionArgs,
  exploreSectionWindow,
  splitExploreEventSections,
} from "./exploreSections";

describe("eventFilterDateBounds", () => {
  it("covers the whole of each day, first moment to last, in the reader's zone", () => {
    expect(
      eventFilterDateBounds("2026-10-10", "2026-10-12", "Africa/Accra"),
    ).toEqual({
      from: "2026-10-10T00:00:00.000Z",
      to: "2026-10-12T23:59:59.999Z",
    });
    // Lagos is an hour ahead of UTC: its day starts at 23:00 UTC.
    expect(
      eventFilterDateBounds("2026-10-10", "2026-10-12", "Africa/Lagos"),
    ).toEqual({
      from: "2026-10-09T23:00:00.000Z",
      to: "2026-10-12T22:59:59.999Z",
    });
  });

  it("reads one day with no end as that whole day", () => {
    expect(eventFilterDateBounds("2026-10-10", null, "Africa/Accra")).toEqual({
      from: "2026-10-10T00:00:00.000Z",
      to: "2026-10-10T23:59:59.999Z",
    });
    // "Today" from the filter sheet: the same day twice.
    expect(
      eventFilterDateBounds("2026-10-10", "2026-10-10", "Africa/Accra"),
    ).toEqual({
      from: "2026-10-10T00:00:00.000Z",
      to: "2026-10-10T23:59:59.999Z",
    });
  });

  it("reads a date picker's local midnight as the day that was picked", () => {
    // A browser in London (UTC+1 in summer) sends local midnight of 10 and
    // 12 July as instants on the 9th and 11th in UTC.
    expect(
      eventFilterDateBounds(
        "2026-07-09T23:00:00.000Z",
        "2026-07-11T23:00:00.000Z",
        "Europe/London",
      ),
    ).toEqual({
      from: "2026-07-09T23:00:00.000Z",
      to: "2026-07-12T22:59:59.999Z",
    });
  });

  it("keeps the last day whole when the clocks change on it", () => {
    // London leaves summer time on 25 October 2026: that day has 25 hours.
    const { from, to } = eventFilterDateBounds(
      "2026-10-25",
      "2026-10-25",
      "Europe/London",
    );
    expect(from).toBe("2026-10-24T23:00:00.000Z");
    expect(to).toBe("2026-10-25T23:59:59.999Z");
  });

  it("has no bound for a missing or unreadable value", () => {
    expect(eventFilterDateBounds(null, null, "Africa/Accra")).toEqual({
      from: null,
      to: null,
    });
    expect(eventFilterDateBounds("", undefined, "Africa/Accra")).toEqual({
      from: null,
      to: null,
    });
    expect(eventFilterDateBounds("soon", null, "Africa/Accra")).toEqual({
      from: null,
      to: null,
    });
    // An end with no start: everything up to the end of that day.
    expect(eventFilterDateBounds(null, "2026-10-12", "Africa/Accra")).toEqual({
      from: null,
      to: "2026-10-12T23:59:59.999Z",
    });
  });
});

describe("eventFilterArgs", () => {
  it("sends nothing for an empty filter", () => {
    const args = eventFilterArgs(EMPTY_EVENT_FILTERS, "Africa/Accra");
    // Left out, not null: JSON drops them and the function's defaults apply.
    expect(JSON.parse(JSON.stringify(args))).toEqual({});
  });

  it("keeps a one-sided price and a one-day date as they are", () => {
    expect(
      eventFilterArgs(
        {
          ...EMPTY_EVENT_FILTERS,
          category: "Food & Drink",
          types: ["Food Festivals"],
          maxPrice: 0,
          startDate: "2026-10-10",
          minRating: 4,
        },
        "Africa/Accra",
      ),
    ).toEqual({
      p_event_category: "Food & Drink",
      p_event_type: ["Food Festivals"],
      p_max_price: 0,
      p_start_date: "2026-10-10T00:00:00.000Z",
      p_end_date: "2026-10-10T23:59:59.999Z",
      p_min_rating: 4,
    });
  });
});

describe("exploreEventSectionArgs", () => {
  const now = new Date("2026-10-02T15:30:00Z");

  it("browses 10 km, with Around you at 5, on the reader's calendar", () => {
    const args = exploreEventSectionArgs({
      lat: 5.6,
      lng: -0.19,
      filters: EMPTY_EVENT_FILTERS,
      zone: "Africa/Accra",
      now,
    });
    expect(args).toMatchObject({
      p_user_lat: 5.6,
      p_user_lng: -0.19,
      p_radius_km: 10,
      p_around_km: 5,
      p_today_end: "2026-10-02T23:59:59.999Z",
      p_month_end: "2026-10-31T23:59:59.999Z",
      p_section_size: 20,
    });
    expect(args.p_sections).toBeUndefined();
  });

  it("narrows the area, and Around you with it, when a distance is chosen", () => {
    const args = exploreEventSectionArgs({
      lat: 5.6,
      lng: -0.19,
      filters: { ...EMPTY_EVENT_FILTERS, maxDistanceKm: 2 },
      zone: "Africa/Accra",
      now,
      sections: ["topRatedOrganizers"],
      sectionSize: 60,
    });
    expect(args.p_radius_km).toBe(2);
    expect(args.p_around_km).toBe(2);
    expect(args.p_sections).toEqual(["topRatedOrganizers"]);
    expect(args.p_section_size).toBe(60);
  });

  it("counts today where the reader is, not in UTC", () => {
    // 23:30 UTC on the 2nd is already the 3rd in Lagos.
    const args = exploreEventSectionArgs({
      lat: 6.5,
      lng: 3.4,
      filters: EMPTY_EVENT_FILTERS,
      zone: "Africa/Lagos",
      now: new Date("2026-10-02T23:30:00Z"),
    });
    expect(args.p_today_end).toBe("2026-10-03T22:59:59.999Z");
    expect(args.p_month_end).toBe("2026-10-31T22:59:59.999Z");
    // The row needs no start: what has not ended and starts by the end of
    // today is on today.
    expect("p_today_start" in args).toBe(false);
  });
});

describe("exploreSectionWindow", () => {
  const now = new Date("2026-10-02T15:30:00Z");

  it("gives each time row the stretch the row itself covers", () => {
    expect(exploreSectionWindow("happeningToday", "Africa/Accra", now)).toEqual(
      { from: "2026-10-02T00:00:00.000Z", to: "2026-10-02T23:59:59.999Z" },
    );
    expect(
      exploreSectionWindow("happeningThisWeek", "Africa/Accra", now),
    ).toEqual({
      from: "2026-10-02T15:30:00.000Z",
      to: "2026-10-09T15:30:00.000Z",
    });
    expect(
      exploreSectionWindow("happeningThisMonth", "Africa/Accra", now),
    ).toEqual({
      from: "2026-10-02T15:30:00.000Z",
      to: "2026-10-31T23:59:59.999Z",
    });
  });

  it("has no window for a row that is not about time", () => {
    expect(exploreSectionWindow("aroundYou", "Africa/Accra", now)).toBeNull();
    expect(
      exploreSectionWindow("topRatedOrganizers", "Africa/Accra", now),
    ).toBeNull();
  });
});

describe("splitExploreEventSections", () => {
  it("lays each event out in the rows it belongs to, in each row's own order", () => {
    const rows = [
      { id: "a", sections: { aroundYou: 2, happeningToday: 1 } },
      { id: "b", sections: { aroundYou: 1, topRatedOrganizers: 1 } },
      { id: "c", sections: { featured: 1, happeningThisMonth: 2 } },
      { id: "d", sections: { happeningThisMonth: 1, happeningThisWeek: 1 } },
    ];
    const out = splitExploreEventSections(rows);
    const ids = (list: { id: string }[]) => list.map((r) => r.id);
    expect(ids(out.aroundYou)).toEqual(["b", "a"]);
    expect(ids(out.happeningToday)).toEqual(["a"]);
    expect(ids(out.topRatedOrganizers)).toEqual(["b"]);
    expect(ids(out.featured)).toEqual(["c"]);
    expect(ids(out.happeningThisMonth)).toEqual(["d", "c"]);
    expect(ids(out.happeningThisWeek)).toEqual(["d"]);
  });

  it("ignores a row with no readable sections", () => {
    const out = splitExploreEventSections([
      { id: "x" },
      { id: "y", sections: null },
      { id: "z", sections: ["aroundYou"] },
      { id: "w", sections: { aroundYou: "1", unknown: 3 } },
    ]);
    expect(Object.values(out).every((list) => list.length === 0)).toBe(true);
  });
});
