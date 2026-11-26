import type {
  ShowcaseHostTile,
  ShowcasePlaceTile,
} from "@abonten/types/showcaseType";
import { describe, expect, it } from "vitest";
import {
  SHOWCASE_DEFAULT_MIN_PER_ROW,
  isOnNow,
  isOnTodayOrThisWeekend,
  showcaseAudienceIncludes,
  showcaseNextUp,
  showcaseRowsToShow,
} from "./rules";

function host(i: number, over: Partial<ShowcaseHostTile> = {}) {
  return {
    kind: "host",
    entryId: `h${i}`,
    subjectId: `u${i}`,
    name: `Host ${i}`,
    username: `host_${i}`,
    imagePublicId: null,
    imageVersion: null,
    verified: false,
    isTeam: false,
    following: false,
    nextEvent: null,
    ...over,
  } satisfies ShowcaseHostTile;
}

function place(i: number, over: Partial<ShowcasePlaceTile> = {}) {
  return {
    kind: "place",
    entryId: `p${i}`,
    subjectId: `pl${i}`,
    ownerId: `o${i}`,
    name: `Place ${i}`,
    slug: `place-${i}`,
    imagePublicId: null,
    imageVersion: null,
    verified: false,
    following: false,
    nextEvent: null,
    openNow: null,
    categorySlug: null,
    categoryName: null,
    area: null,
    ...over,
  } satisfies ShowcasePlaceTile;
}

const many = <T>(n: number, make: (i: number) => T) =>
  Array.from({ length: n }, (_, i) => make(i));

describe("showcaseRowsToShow", () => {
  it("keeps a row that reaches the minimum and drops one below it", () => {
    const out = showcaseRowsToShow(
      { hosts: many(4, (i) => host(i)), places: many(3, (i) => place(i)) },
      4,
    );
    expect(out?.hosts).toHaveLength(4);
    expect(out?.places).toEqual([]);
  });

  it("hides the whole section when no row reaches the minimum", () => {
    expect(
      showcaseRowsToShow(
        { hosts: many(3, (i) => host(i)), places: many(2, (i) => place(i)) },
        4,
      ),
    ).toBeNull();
    expect(showcaseRowsToShow({ hosts: [], places: [] }, 1)).toBeNull();
  });

  it("shows both rows when both qualify", () => {
    const out = showcaseRowsToShow(
      { hosts: many(5, (i) => host(i)), places: many(6, (i) => place(i)) },
      5,
    );
    expect(out?.hosts).toHaveLength(5);
    expect(out?.places).toHaveLength(6);
  });

  it("treats a minimum below one as one and a broken one as the default", () => {
    expect(
      showcaseRowsToShow({ hosts: [host(1)], places: [] }, 0)?.hosts,
    ).toHaveLength(1);
    expect(
      showcaseRowsToShow(
        {
          hosts: many(SHOWCASE_DEFAULT_MIN_PER_ROW - 1, (i) => host(i)),
          places: [],
        },
        Number.NaN,
      ),
    ).toBeNull();
  });
});

describe("showcaseAudienceIncludes", () => {
  const staff = async (id: string) => id === "staff";

  it("lets everyone in, signed out too, when open to all", async () => {
    expect(await showcaseAudienceIncludes("all", [], null, staff)).toBe(true);
  });

  it("keeps signed-out visitors out otherwise", async () => {
    expect(await showcaseAudienceIncludes("staff", [], null, staff)).toBe(
      false,
    );
    expect(await showcaseAudienceIncludes("beta", ["x"], null, staff)).toBe(
      false,
    );
  });

  it("lets listed beta testers and staff in for beta, only staff for staff", async () => {
    expect(await showcaseAudienceIncludes("beta", ["b"], "b", staff)).toBe(
      true,
    );
    expect(await showcaseAudienceIncludes("beta", ["b"], "staff", staff)).toBe(
      true,
    );
    expect(await showcaseAudienceIncludes("beta", ["b"], "c", staff)).toBe(
      false,
    );
    expect(await showcaseAudienceIncludes("staff", ["b"], "b", staff)).toBe(
      false,
    );
    expect(await showcaseAudienceIncludes("staff", [], "staff", staff)).toBe(
      true,
    );
  });
});

// 2026-11-23 is a Monday; Accra is UTC+0, London is UTC+0 in November,
// Nairobi is UTC+3, Los Angeles UTC-8.
const iso = (s: string) => new Date(s);

describe("isOnTodayOrThisWeekend", () => {
  const monNoon = iso("2026-11-23T12:00:00Z");

  it("is on for an event later today", () => {
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-23T20:00:00Z",
        "2026-11-23T23:00:00Z",
        "Africa/Accra",
        monNoon,
      ),
    ).toBe(true);
  });

  it("is on for an event running now", () => {
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-20T10:00:00Z",
        "2026-11-30T22:00:00Z",
        "Africa/Accra",
        monNoon,
      ),
    ).toBe(true);
  });

  it("is off for a weekday later in the week, on for the weekend", () => {
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-25T19:00:00Z",
        "2026-11-25T23:00:00Z",
        "Africa/Accra",
        monNoon,
      ),
    ).toBe(false);
    for (const day of ["2026-11-27", "2026-11-28", "2026-11-29"]) {
      expect(
        isOnTodayOrThisWeekend(
          `${day}T19:00:00Z`,
          `${day}T23:00:00Z`,
          "Africa/Accra",
          monNoon,
        ),
        day,
      ).toBe(true);
    }
  });

  it("is off from the next Monday on, and for an event that has ended", () => {
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-30T19:00:00Z",
        "2026-11-30T23:00:00Z",
        "Africa/Accra",
        monNoon,
      ),
    ).toBe(false);
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-23T08:00:00Z",
        "2026-11-23T10:00:00Z",
        "Africa/Accra",
        monNoon,
      ),
    ).toBe(false);
  });

  it("on a Saturday, counts the rest of the weekend but not the Monday", () => {
    const sat = iso("2026-11-28T10:00:00Z");
    expect(
      isOnTodayOrThisWeekend("2026-11-29T18:00:00Z", null, "Africa/Accra", sat),
    ).toBe(true);
    expect(
      isOnTodayOrThisWeekend("2026-11-30T01:00:00Z", null, "Africa/Accra", sat),
    ).toBe(false);
  });

  it("reads the day on the event's own clock", () => {
    // Monday 22:30 UTC is already Tuesday 01:30 in Nairobi; the event at
    // 03:00 Nairobi time on Tuesday is "today" there, though it is Monday
    // in UTC.
    const lateMon = iso("2026-11-23T22:30:00Z");
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-24T00:00:00Z",
        "2026-11-24T02:00:00Z",
        "Africa/Nairobi",
        lateMon,
      ),
    ).toBe(true);
    // Thursday 23:00 in Los Angeles is Friday 07:00 UTC: not yet the
    // weekend there, so a Thursday-night event in LA is not "this weekend"
    // when asked on Monday...
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-27T05:00:00Z",
        "2026-11-27T07:00:00Z",
        "America/Los_Angeles",
        monNoon,
      ),
    ).toBe(false);
    // ...while the same instants read in Accra fall on Friday.
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-27T05:00:00Z",
        "2026-11-27T07:00:00Z",
        "Africa/Accra",
        monNoon,
      ),
    ).toBe(true);
  });

  it("falls back to UTC for an unknown zone and refuses a bad date", () => {
    expect(
      isOnTodayOrThisWeekend(
        "2026-11-23T20:00:00Z",
        null,
        "Not/A_Zone",
        monNoon,
      ),
    ).toBe(true);
    expect(
      isOnTodayOrThisWeekend("not a date", null, "Africa/Accra", monNoon),
    ).toBe(false);
  });
});

describe("isOnNow", () => {
  it("needs a start in the past and an end in the future", () => {
    const now = iso("2026-11-23T12:00:00Z");
    expect(isOnNow("2026-11-23T10:00:00Z", "2026-11-23T13:00:00Z", now)).toBe(
      true,
    );
    expect(isOnNow("2026-11-23T13:00:00Z", "2026-11-23T15:00:00Z", now)).toBe(
      false,
    );
    expect(isOnNow("2026-11-23T10:00:00Z", null, now)).toBe(false);
  });
});

describe("showcaseNextUp", () => {
  const now = iso("2026-11-23T12:00:00Z");
  const event = {
    id: "e1",
    eventCode: "abc",
    title: "Afro-house night",
    startsAt: "2026-12-04T20:00:00Z",
    endsAt: "2026-12-05T02:00:00Z",
    timezone: "Africa/Accra",
  };

  it("names a host's next event, with no dot when it is weeks away", () => {
    expect(showcaseNextUp(host(1, { nextEvent: event }), now)).toEqual({
      kind: "event",
      title: "Afro-house night",
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: "Africa/Accra",
      onNow: false,
      soon: false,
    });
  });

  it("says nothing for a host without an event", () => {
    expect(showcaseNextUp(host(1), now)).toBeNull();
  });

  it("prefers a place's next event, then Open now, then category and area", () => {
    const tonight = {
      ...event,
      startsAt: "2026-11-23T19:00:00Z",
      endsAt: "2026-11-23T23:00:00Z",
    };
    expect(
      showcaseNextUp(place(1, { nextEvent: tonight, openNow: true }), now),
    ).toMatchObject({ kind: "event", soon: true, onNow: false });
    expect(showcaseNextUp(place(1, { openNow: true }), now)).toEqual({
      kind: "open_now",
    });
    expect(
      showcaseNextUp(
        place(1, {
          openNow: false,
          categorySlug: "restaurant",
          categoryName: "Restaurant",
          area: "Osu",
        }),
        now,
      ),
    ).toEqual({
      kind: "place_info",
      categorySlug: "restaurant",
      categoryName: "Restaurant",
      area: "Osu",
    });
    expect(showcaseNextUp(place(1, { openNow: false }), now)).toBeNull();
  });

  it("marks an event that is running now", () => {
    const running = {
      ...event,
      startsAt: "2026-11-23T10:00:00Z",
      endsAt: "2026-11-23T18:00:00Z",
    };
    expect(showcaseNextUp(host(1, { nextEvent: running }), now)).toMatchObject({
      onNow: true,
      soon: true,
    });
  });
});
