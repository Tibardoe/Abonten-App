import { describe, expect, it } from "vitest";
import {
  MAX_SHOWS_PER_REQUEST,
  expandShowRun,
  groupShowsByVenue,
  showVenueLabel,
} from "./showRuns";

const NOW = new Date("2026-11-19T12:00:00Z");

describe("expandShowRun", () => {
  it("turns a weekly pattern into show times in the venue's zone", () => {
    // Honey Trap: Fri 4pm; Sat 4pm, 8pm; Sun 1pm — one weekend.
    const result = expandShowRun(
      {
        fromDate: "2026-12-04",
        untilDate: "2026-12-06",
        slots: [
          { weekday: 5, time: "16:00" },
          { weekday: 6, time: "16:00" },
          { weekday: 6, time: "20:00" },
          { weekday: 0, time: "13:00" },
        ],
        durationMinutes: 150,
      },
      "Africa/Accra",
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      shows: [
        {
          startsAt: "2026-12-04T16:00:00.000Z",
          endsAt: "2026-12-04T18:30:00.000Z",
        },
        {
          startsAt: "2026-12-05T16:00:00.000Z",
          endsAt: "2026-12-05T18:30:00.000Z",
        },
        {
          startsAt: "2026-12-05T20:00:00.000Z",
          endsAt: "2026-12-05T22:30:00.000Z",
        },
        {
          startsAt: "2026-12-06T13:00:00.000Z",
          endsAt: "2026-12-06T15:30:00.000Z",
        },
      ],
    });
  });

  it("reads times on the venue's clock, not UTC", () => {
    const result = expandShowRun(
      {
        fromDate: "2026-12-04",
        untilDate: "2026-12-04",
        slots: [{ weekday: 5, time: "20:00" }],
        durationMinutes: 120,
      },
      "Europe/Paris",
      NOW,
    );
    expect(result.ok && result.shows[0].startsAt).toBe(
      "2026-12-04T19:00:00.000Z",
    );
  });

  it("skips shows that have already started and refuses a run with none ahead", () => {
    const today = expandShowRun(
      {
        fromDate: "2026-11-19",
        untilDate: "2026-11-19",
        slots: [
          { weekday: 4, time: "10:00" },
          { weekday: 4, time: "18:00" },
        ],
        durationMinutes: 60,
      },
      "Africa/Accra",
      NOW,
    );
    expect(today.ok && today.shows.map((s) => s.startsAt)).toEqual([
      "2026-11-19T18:00:00.000Z",
    ]);
    expect(
      expandShowRun(
        {
          fromDate: "2026-11-01",
          untilDate: "2026-11-02",
          slots: [{ weekday: 0, time: "10:00" }],
          durationMinutes: 60,
        },
        "Africa/Accra",
        NOW,
      ),
    ).toEqual({ ok: false, problem: "none_ahead" });
  });

  it("refuses bad input and runs that are too big", () => {
    const base = {
      fromDate: "2026-12-01",
      untilDate: "2026-12-31",
      slots: [{ weekday: 5 as const, time: "16:00" }],
      durationMinutes: 120,
    };
    expect(expandShowRun({ ...base, slots: [] }, "Africa/Accra", NOW)).toEqual({
      ok: false,
      problem: "no_slots",
    });
    expect(
      expandShowRun(
        { ...base, slots: [{ weekday: 5, time: "25:00" }] },
        "Africa/Accra",
        NOW,
      ),
    ).toEqual({ ok: false, problem: "bad_slot" });
    expect(
      expandShowRun({ ...base, untilDate: "2026-11-30" }, "Africa/Accra", NOW),
    ).toEqual({ ok: false, problem: "bad_range" });
    expect(
      expandShowRun({ ...base, durationMinutes: 5 }, "Africa/Accra", NOW),
    ).toEqual({ ok: false, problem: "bad_duration" });
    expect(
      expandShowRun({ ...base, untilDate: "2028-01-01" }, "Africa/Accra", NOW),
    ).toEqual({ ok: false, problem: "too_long" });
    // Every day at three times for a month: more than one request takes.
    const daily = [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) =>
      ["10:00", "14:00", "18:00"].map((time) => ({
        weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        time,
      })),
    );
    expect(
      expandShowRun({ ...base, slots: daily }, "Africa/Accra", NOW),
    ).toEqual({ ok: false, problem: "too_many" });
    expect(MAX_SHOWS_PER_REQUEST).toBe(60);
  });
});

describe("groupShowsByVenue", () => {
  it("groups a tour by venue, in the order of each venue's first show", () => {
    const shows = [
      {
        id: "a",
        place_id: null,
        venue_name: null,
        venue_address: "Labadi Beach Hotel, Accra",
      },
      {
        id: "b",
        place_id: "p1",
        venue_name: "Kumasi Cultural Centre",
        venue_address: "Bantama, Kumasi",
      },
      {
        id: "c",
        place_id: null,
        venue_name: null,
        venue_address: " labadi beach hotel, accra ",
      },
    ];
    const groups = groupShowsByVenue(shows);
    expect(groups.map((g) => g.label)).toEqual([
      "Labadi Beach Hotel, Accra",
      "Kumasi Cultural Centre",
    ]);
    expect(groups[0].shows.map((s) => s.id)).toEqual(["a", "c"]);
    expect(groups[1].shows.map((s) => s.id)).toEqual(["b"]);
  });

  it("keeps a run at one venue in one group", () => {
    const shows = [
      { id: "a", venue_address: "Osu, Accra" },
      { id: "b", venue_address: "Osu, Accra" },
    ];
    expect(groupShowsByVenue(shows)).toHaveLength(1);
    expect(showVenueLabel({ venue_name: " ", venue_address: "Osu" })).toBe(
      "Osu",
    );
  });
});
