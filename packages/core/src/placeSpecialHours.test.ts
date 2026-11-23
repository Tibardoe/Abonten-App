import { describe, expect, it } from "vitest";
import {
  type PlaceOpeningHourRow,
  computePlaceOpenStatus,
  isPlaceOpenNow,
  placeLocalDay,
} from "./computePlaceOpenStatus";
import { t } from "./i18n/testTranslator";
import {
  type PlaceSpecialHourRow,
  SPECIAL_HOURS_LABEL_MAX,
  calendarDateWeekday,
  isCalendarDate,
  normalizeSpecialHours,
  placeLocalDate,
  specialHoursProblem,
  specialHoursProblemMessage,
  upcomingSpecialHours,
} from "./placeSpecialHours";

// Every day 09:00–17:00, and a late bar every day 18:00–02:00.
const everyDay = (open: string, close: string): PlaceOpeningHourRow[] =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day_of_week: day,
    open_time: open,
    close_time: close,
    is_closed: false,
  }));

const special = (
  date: string,
  hours: { open?: string; close?: string; closed?: boolean },
  label: string | null = null,
): PlaceSpecialHourRow => ({
  special_date: date,
  open_time: hours.closed ? null : (hours.open ?? null),
  close_time: hours.closed ? null : (hours.close ?? null),
  is_closed: hours.closed === true,
  label,
});

// Friday 25 December 2026, in Accra (UTC+0).
const christmasNoon = new Date("2026-12-25T12:00:00Z");
const ACCRA = "Africa/Accra";

describe("special dates in 'open now'", () => {
  it("closes a place all day on a special date marked closed", () => {
    const status = computePlaceOpenStatus(
      { t },
      everyDay("09:00", "17:00"),
      null,
      christmasNoon,
      ACCRA,
      [special("2026-12-25", { closed: true }, "Christmas Day")],
    );
    expect(status).toEqual({ isOpen: false, label: "Closed today" });
  });

  it("uses a special date's own hours in place of the weekday's", () => {
    const hours = [special("2026-12-25", { open: "13:00", close: "16:00" })];
    expect(
      computePlaceOpenStatus(
        { t },
        everyDay("09:00", "17:00"),
        null,
        christmasNoon,
        ACCRA,
        hours,
      ),
    ).toEqual({ isOpen: false, label: "Closed · Opens at 1:00 PM" });
    expect(
      isPlaceOpenNow(
        everyDay("09:00", "17:00"),
        null,
        new Date("2026-12-25T15:00:00Z"),
        ACCRA,
        hours,
      ),
    ).toBe(true);
  });

  it("opens a place on a special date when its weekday is closed", () => {
    const fridaysClosed = everyDay("09:00", "17:00").map((h) =>
      h.day_of_week === 5 ? { ...h, is_closed: true } : h,
    );
    expect(
      isPlaceOpenNow(fridaysClosed, null, christmasNoon, ACCRA, [
        special("2026-12-25", { open: "10:00", close: "14:00" }),
      ]),
    ).toBe(true);
    expect(isPlaceOpenNow(fridaysClosed, null, christmasNoon, ACCRA)).toBe(
      false,
    );
  });

  it("only changes its own date", () => {
    // The 24th is closed; the 25th keeps its weekday hours.
    expect(
      isPlaceOpenNow(everyDay("09:00", "17:00"), null, christmasNoon, ACCRA, [
        special("2026-12-24", { closed: true }),
      ]),
    ).toBe(true);
  });

  it("runs a special date's hours past midnight", () => {
    // New Year's Eve 20:00 to 04:00 on a place that otherwise shuts at 17:00.
    const hours = [special("2026-12-31", { open: "20:00", close: "04:00" })];
    const afterMidnight = new Date("2027-01-01T02:30:00Z");
    expect(
      computePlaceOpenStatus(
        { t },
        everyDay("09:00", "17:00"),
        null,
        afterMidnight,
        ACCRA,
        hours,
      ),
    ).toEqual({ isOpen: true, label: "Open now · Closes at 4:00 AM" });
    expect(
      isPlaceOpenNow(
        everyDay("09:00", "17:00"),
        null,
        new Date("2027-01-01T04:30:00Z"),
        ACCRA,
        hours,
      ),
    ).toBe(false);
  });

  it("keeps yesterday's late hours after midnight on a closed special date", () => {
    // The 24th's 18:00–02:00 still runs into the 25th, which is closed.
    const bar = everyDay("18:00", "02:00");
    const hours = [special("2026-12-25", { closed: true })];
    expect(
      isPlaceOpenNow(bar, null, new Date("2026-12-25T01:00:00Z"), ACCRA, hours),
    ).toBe(true);
    expect(
      isPlaceOpenNow(bar, null, new Date("2026-12-25T19:00:00Z"), ACCRA, hours),
    ).toBe(false);
  });

  it("drops yesterday's late hours when yesterday was a closed special date", () => {
    const bar = everyDay("18:00", "02:00");
    expect(
      isPlaceOpenNow(bar, null, new Date("2026-12-25T01:00:00Z"), ACCRA, [
        special("2026-12-24", { closed: true }),
      ]),
    ).toBe(false);
  });

  it("reads the special date on the place's calendar, not the viewer's", () => {
    // 23:30 UTC on the 24th is already the 25th in Tokyo.
    const now = new Date("2026-12-24T23:30:00Z");
    expect(placeLocalDay(now, "Asia/Tokyo")).toEqual({
      date: "2026-12-25",
      dow: 5,
      minutes: 8 * 60 + 30,
    });
    expect(
      isPlaceOpenNow(everyDay("08:00", "20:00"), null, now, "Asia/Tokyo", [
        special("2026-12-25", { closed: true }),
      ]),
    ).toBe(false);
  });

  it("is still closed while a temporary status is set", () => {
    expect(
      isPlaceOpenNow([], "temporarily_closed", christmasNoon, ACCRA, [
        special("2026-12-25", { open: "00:00", close: "00:00" }),
      ]),
    ).toBe(false);
  });
});

describe("special dates on the place page", () => {
  const rows = [
    special("2027-01-30", { closed: true }),
    special("2026-12-31", { open: "20:00", close: "04:00" }),
    special("2026-12-24", { closed: true }),
    special("2026-12-25", { closed: true }, "Christmas Day"),
  ];

  it("lists today's and the next days' dates, soonest first", () => {
    expect(
      upcomingSpecialHours(rows, christmasNoon, ACCRA).map(
        (r) => r.special_date,
      ),
    ).toEqual(["2026-12-25", "2026-12-31"]);
  });

  it("takes the window in days", () => {
    expect(upcomingSpecialHours(rows, christmasNoon, ACCRA, 60)).toHaveLength(
      3,
    );
    expect(upcomingSpecialHours(null, christmasNoon, ACCRA)).toEqual([]);
  });
});

describe("adding a special date", () => {
  const now = new Date("2026-11-23T10:00:00Z");

  it("accepts today and later, closed or with times", () => {
    expect(
      specialHoursProblem({ date: "2026-11-23", isClosed: true }, now, ACCRA),
    ).toBeNull();
    expect(
      specialHoursProblem(
        {
          date: "2026-12-31",
          isClosed: false,
          openTime: "20:00",
          closeTime: "04:00",
          label: "New Year's Eve",
        },
        now,
        ACCRA,
      ),
    ).toBeNull();
  });

  it("refuses a past, a made-up or a far date", () => {
    expect(
      specialHoursProblem({ date: "2026-11-22", isClosed: true }, now, ACCRA),
    ).toBe("date_past");
    expect(
      specialHoursProblem({ date: "2026-02-30", isClosed: true }, now, ACCRA),
    ).toBe("date_invalid");
    expect(
      specialHoursProblem({ date: "2028-01-01", isClosed: true }, now, ACCRA),
    ).toBe("date_too_far");
  });

  it("needs both times for an open day", () => {
    expect(
      specialHoursProblem(
        { date: "2026-12-01", isClosed: false, openTime: "09:00" },
        now,
        ACCRA,
      ),
    ).toBe("times_required");
  });

  it("keeps the name short and free of links", () => {
    expect(
      specialHoursProblem(
        {
          date: "2026-12-01",
          isClosed: true,
          label: "x".repeat(SPECIAL_HOURS_LABEL_MAX + 1),
        },
        now,
        ACCRA,
      ),
    ).toBe("label_too_long");
    expect(
      specialHoursProblem(
        { date: "2026-12-01", isClosed: true, label: "See www.example.com" },
        now,
        ACCRA,
      ),
    ).toBe("label_link");
  });

  it("stores no times for a closed day and folds the name's spaces", () => {
    expect(
      normalizeSpecialHours({
        date: "2026-12-25",
        isClosed: true,
        openTime: "09:00",
        closeTime: "17:00",
        label: "  Christmas \n Day ",
      }),
    ).toEqual({
      special_date: "2026-12-25",
      is_closed: true,
      open_time: null,
      close_time: null,
      label: "Christmas Day",
    });
  });

  it("words every problem", () => {
    for (const problem of [
      "date_invalid",
      "date_past",
      "date_too_far",
      "times_required",
      "label_too_long",
      "label_link",
      "too_many",
    ] as const) {
      expect(specialHoursProblemMessage(t, problem)).not.toMatch(
        /specialHours\./,
      );
    }
  });
});

describe("calendar helpers", () => {
  it("knows a real calendar day and its weekday", () => {
    expect(isCalendarDate("2026-12-25")).toBe(true);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("25/12/2026")).toBe(false);
    expect(calendarDateWeekday("2026-12-25")).toBe(5);
  });

  it("gives today's date at the place", () => {
    expect(placeLocalDate(new Date("2026-12-24T23:30:00Z"), ACCRA)).toBe(
      "2026-12-24",
    );
    expect(
      placeLocalDate(new Date("2026-12-24T23:30:00Z"), "Pacific/Kiritimati"),
    ).toBe("2026-12-25");
  });
});
