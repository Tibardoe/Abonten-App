import { describe, expect, it } from "vitest";
import {
  SALES_CLOSE_CHOICES,
  isSessionOnSale,
  parseSalesClose,
  resolveOccurrenceState,
  salesCloseChoice,
  salesCloseClock,
  salesCloseFromChoice,
  salesCloseLabel,
  salesCloseOf,
  sessionSalesCloseAt,
  validatePurchaseOccurrence,
} from "./eventPurchaseEligibility";

// Fixed reference "now" so every case is deterministic.
const NOW = Date.parse("2026-09-06T12:00:00.000Z");
const H = 60 * 60 * 1000;

const occ = (id: string, startOffsetH: number, durationH = 2) => ({
  id,
  starts_at: new Date(NOW + startOffsetH * H).toISOString(),
  ends_at: new Date(NOW + (startOffsetH + durationH) * H).toISOString(),
});

describe("resolveOccurrenceState", () => {
  it("returns no_dates when there is no schedule at all", () => {
    const s = resolveOccurrenceState(null, null, null, NOW);
    expect(s.status).toBeNull();
    expect(s.purchasable).toBe(false);
    expect(s.blockReason).toBe("no_dates");
  });

  it("single future date -> purchasable, upcoming", () => {
    const s = resolveOccurrenceState(
      occ("x", 24).starts_at,
      occ("x", 24).ends_at,
      null,
      NOW,
    );
    expect(s.status).toBe("upcoming");
    expect(s.purchasable).toBe(true);
    expect(s.blockReason).toBeNull();
  });

  it("single date currently ongoing -> NOT purchasable (block at start)", () => {
    const s = resolveOccurrenceState(
      new Date(NOW - H).toISOString(),
      new Date(NOW + H).toISOString(),
      null,
      NOW,
    );
    expect(s.status).toBe("ongoing");
    expect(s.current).not.toBeNull();
    expect(s.purchasable).toBe(false);
    expect(s.blockReason).toBe("ongoing_no_future");
  });

  it("single date fully ended -> NOT purchasable", () => {
    const s = resolveOccurrenceState(
      new Date(NOW - 4 * H).toISOString(),
      new Date(NOW - 2 * H).toISOString(),
      null,
      NOW,
    );
    expect(s.status).toBe("ended");
    expect(s.purchasable).toBe(false);
    expect(s.blockReason).toBe("ended");
  });

  it("multi-date: some past, one future -> purchasable for the future one", () => {
    const s = resolveOccurrenceState(
      null,
      null,
      [
        occ("d1", -48),
        occ("d2", -2), // ended 0h ago-ish (ends at NOW - 0h) -> boundary handled below
        occ("d3", 48),
      ],
      NOW,
    );
    expect(s.purchasable).toBe(true);
    expect(s.nextPurchasable?.id).toBe("d3");
  });

  it("multi-date: one ongoing + one future -> purchasable, next is the future one, current is the ongoing one", () => {
    const s = resolveOccurrenceState(
      null,
      null,
      [
        occ("d1", -48),
        {
          id: "d2",
          starts_at: new Date(NOW - H).toISOString(),
          ends_at: new Date(NOW + H).toISOString(),
        },
        occ("d3", 48),
      ],
      NOW,
    );
    expect(s.status).toBe("ongoing");
    expect(s.current?.id).toBe("d2");
    expect(s.purchasable).toBe(true);
    expect(s.nextPurchasable?.id).toBe("d3");
  });

  it("multi-date: current occurrence has ended + future exists -> status upcoming, not ongoing", () => {
    const s = resolveOccurrenceState(
      null,
      null,
      [
        {
          id: "d2",
          starts_at: new Date(NOW - 4 * H).toISOString(),
          ends_at: new Date(NOW - H).toISOString(),
        },
        occ("d3", 48),
      ],
      NOW,
    );
    expect(s.status).toBe("upcoming");
    expect(s.current).toBeNull();
    expect(s.purchasable).toBe(true);
    expect(s.nextPurchasable?.id).toBe("d3");
  });

  it("multi-date: all occurrences finished -> ended, not purchasable", () => {
    const s = resolveOccurrenceState(
      null,
      null,
      [occ("d1", -72), occ("d2", -48), occ("d3", -24)],
      NOW,
    );
    expect(s.status).toBe("ended");
    expect(s.purchasable).toBe(false);
    expect(s.blockReason).toBe("ended");
  });

  it("multi-date: ongoing with NO future -> ongoing_no_future", () => {
    const s = resolveOccurrenceState(
      null,
      null,
      [
        occ("d1", -48),
        {
          id: "d2",
          starts_at: new Date(NOW - H).toISOString(),
          ends_at: new Date(NOW + H).toISOString(),
        },
      ],
      NOW,
    );
    expect(s.status).toBe("ongoing");
    expect(s.purchasable).toBe(false);
    expect(s.blockReason).toBe("ongoing_no_future");
  });

  it("handles out-of-order and duplicate occurrences", () => {
    const s = resolveOccurrenceState(
      null,
      null,
      [occ("d3", 48), occ("d1", -48), occ("d3-dup", 48), occ("d2", 24)],
      NOW,
    );
    expect(s.future.map((o) => o.id)).toEqual(["d2", "d3", "d3-dup"]);
    expect(s.nextPurchasable?.id).toBe("d2");
  });

  it("drops invalid dates instead of poisoning the comparison", () => {
    const s = resolveOccurrenceState(
      null,
      null,
      [
        { id: "bad", starts_at: "not-a-date", ends_at: "nope" },
        occ("good", 24),
      ],
      NOW,
    );
    expect(s.future.map((o) => o.id)).toEqual(["good"]);
    expect(s.purchasable).toBe(true);
  });

  describe("boundary: exactly at start / end, +/- 1s", () => {
    const start = NOW;
    const end = NOW + 2 * H;
    const single = (now: number) =>
      resolveOccurrenceState(
        new Date(start).toISOString(),
        new Date(end).toISOString(),
        null,
        now,
      );

    it("1s before start -> upcoming, purchasable", () => {
      expect(single(start - 1000).status).toBe("upcoming");
      expect(single(start - 1000).purchasable).toBe(true);
    });
    it("exactly at start -> ongoing, NOT purchasable", () => {
      expect(single(start).status).toBe("ongoing");
      expect(single(start).purchasable).toBe(false);
    });
    it("1s after start -> ongoing, NOT purchasable", () => {
      expect(single(start + 1000).status).toBe("ongoing");
      expect(single(start + 1000).purchasable).toBe(false);
    });
    it("1s before end -> ongoing", () => {
      expect(single(end - 1000).status).toBe("ongoing");
    });
    it("exactly at end -> ended", () => {
      expect(single(end).status).toBe("ended");
    });
    it("1s after end -> ended", () => {
      expect(single(end + 1000).status).toBe("ended");
    });
  });

  it("equal start and end time is treated as instantaneous/ended once reached", () => {
    const t = NOW - 1000;
    const s = resolveOccurrenceState(
      new Date(t).toISOString(),
      new Date(t).toISOString(),
      null,
      NOW,
    );
    // now >= ends -> past
    expect(s.status).toBe("ended");
  });
});

describe("validatePurchaseOccurrence", () => {
  const occurrences = [
    occ("past", -24),
    occ("ongoing-ish", -1),
    occ("future", 24),
  ];

  it("rejects an id that does not belong to the event", () => {
    expect(validatePurchaseOccurrence("nope", occurrences, NOW)).toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  it("rejects an occurrence that has already started", () => {
    expect(validatePurchaseOccurrence("past", occurrences, NOW)).toEqual({
      ok: false,
      reason: "started",
    });
    expect(validatePurchaseOccurrence("ongoing-ish", occurrences, NOW).ok).toBe(
      false,
    );
  });

  it("accepts a strictly future occurrence", () => {
    const res = validatePurchaseOccurrence("future", occurrences, NOW);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.occurrence.id).toBe("future");
  });
});

// Keep selling while it's on (event.sales_close_before_end_minutes): an
// amusement park open 11:00-19:00 selling today's entry after it opens.
describe("sales close before the end", () => {
  const PARK_OPEN = Date.parse("2026-11-23T11:00:00.000Z");
  const PARK_CLOSE = Date.parse("2026-11-23T19:00:00.000Z");
  const today = {
    starts_at: new Date(PARK_OPEN).toISOString(),
    ends_at: new Date(PARK_CLOSE).toISOString(),
  };
  const at = (hhmm: string) => Date.parse(`2026-11-23T${hhmm}:00.000Z`);

  describe("sessionSalesCloseAt", () => {
    it("closes at the start by default (null or an unknown value)", () => {
      expect(sessionSalesCloseAt(today, null)?.getTime()).toBe(PARK_OPEN);
      expect(sessionSalesCloseAt(today, undefined)?.getTime()).toBe(PARK_OPEN);
      expect(sessionSalesCloseAt(today, 45)?.getTime()).toBe(PARK_OPEN);
    });
    it("closes N minutes before the end", () => {
      expect(sessionSalesCloseAt(today, 60)?.getTime()).toBe(at("18:00"));
      expect(sessionSalesCloseAt(today, 0)?.getTime()).toBe(PARK_CLOSE);
    });
    it("never closes before the start", () => {
      const short = {
        starts_at: today.starts_at,
        ends_at: new Date(PARK_OPEN + 30 * 60 * 1000).toISOString(),
      };
      expect(sessionSalesCloseAt(short, 120)?.getTime()).toBe(PARK_OPEN);
    });
    it("is null for an unreadable start; an unreadable end closes at the start", () => {
      expect(sessionSalesCloseAt({ starts_at: "x", ends_at: "y" }, 0)).toBe(
        null,
      );
      expect(
        sessionSalesCloseAt(
          { starts_at: today.starts_at, ends_at: "y" },
          0,
        )?.getTime(),
      ).toBe(PARK_OPEN);
    });
  });

  describe("isSessionOnSale", () => {
    it("before the start: on sale whatever the setting", () => {
      expect(isSessionOnSale(today, null, at("10:59"))).toBe(true);
      expect(isSessionOnSale(today, 60, at("10:59"))).toBe(true);
    });
    it("at the start: closed by default, open with the setting", () => {
      expect(isSessionOnSale(today, null, PARK_OPEN)).toBe(false);
      expect(isSessionOnSale(today, 60, PARK_OPEN)).toBe(true);
    });
    it("running: open until the cut-off, closed from it", () => {
      expect(isSessionOnSale(today, 60, at("17:59"))).toBe(true);
      expect(isSessionOnSale(today, 60, at("18:00"))).toBe(false);
      expect(isSessionOnSale(today, 0, at("18:59"))).toBe(true);
      expect(isSessionOnSale(today, 0, PARK_CLOSE)).toBe(false);
    });
  });

  describe("resolveOccurrenceState with the setting", () => {
    it("single date running, default -> not purchasable (unchanged)", () => {
      const s = resolveOccurrenceState(today.starts_at, today.ends_at, null, {
        now: at("14:00"),
      });
      expect(s.purchasable).toBe(false);
      expect(s.blockReason).toBe("ongoing_no_future");
      expect(s.onNow).toBe(false);
      expect(s.salesCloseAt).toBeNull();
    });

    it("single date running, 60 min before the end -> purchasable, on now until 18:00", () => {
      const s = resolveOccurrenceState(today.starts_at, today.ends_at, null, {
        now: at("14:00"),
        salesCloseBeforeEndMinutes: 60,
      });
      expect(s.status).toBe("ongoing");
      expect(s.purchasable).toBe(true);
      expect(s.blockReason).toBeNull();
      expect(s.onNow).toBe(true);
      expect(s.salesCloseAt?.getTime()).toBe(at("18:00"));
      // A single-date event's pseudo-session has no id: nothing to send.
      expect(s.nextPurchasable?.id).toBeUndefined();
    });

    it("single date past the cut-off -> ongoing_no_future", () => {
      const s = resolveOccurrenceState(today.starts_at, today.ends_at, null, {
        now: at("18:30"),
        salesCloseBeforeEndMinutes: 60,
      });
      expect(s.purchasable).toBe(false);
      expect(s.blockReason).toBe("ongoing_no_future");
      expect(s.onNow).toBe(false);
    });

    it("single date not started, with the setting -> upcoming, closes before the end", () => {
      const s = resolveOccurrenceState(today.starts_at, today.ends_at, null, {
        now: at("09:00"),
        salesCloseBeforeEndMinutes: 30,
      });
      expect(s.status).toBe("upcoming");
      expect(s.purchasable).toBe(true);
      expect(s.onNow).toBe(false);
      expect(s.salesCloseAt?.getTime()).toBe(at("18:30"));
    });

    it("default setting: a future session closes at its start", () => {
      const s = resolveOccurrenceState(today.starts_at, today.ends_at, null, {
        now: at("09:00"),
      });
      expect(s.salesCloseAt?.getTime()).toBe(PARK_OPEN);
    });

    it("ended session -> ended, whatever the setting", () => {
      const s = resolveOccurrenceState(today.starts_at, today.ends_at, null, {
        now: at("19:30"),
        salesCloseBeforeEndMinutes: 0,
      });
      expect(s.blockReason).toBe("ended");
    });

    // A park with a date per day (event_occurrence): today's is running,
    // tomorrow's is ahead.
    const days = [
      {
        id: "yesterday",
        starts_at: "2026-11-22T11:00:00.000Z",
        ends_at: "2026-11-22T19:00:00.000Z",
      },
      { id: "today", starts_at: today.starts_at, ends_at: today.ends_at },
      {
        id: "tomorrow",
        starts_at: "2026-11-24T11:00:00.000Z",
        ends_at: "2026-11-24T19:00:00.000Z",
      },
    ];

    it("multi-date: today's running date comes first while it is on sale", () => {
      const s = resolveOccurrenceState(null, null, days, {
        now: at("14:00"),
        salesCloseBeforeEndMinutes: 60,
      });
      expect(s.nextPurchasable?.id).toBe("today");
      expect(s.onNow).toBe(true);
      expect(s.current?.id).toBe("today");
    });

    it("multi-date: past today's cut-off, tomorrow is next", () => {
      const s = resolveOccurrenceState(null, null, days, {
        now: at("18:15"),
        salesCloseBeforeEndMinutes: 60,
      });
      expect(s.nextPurchasable?.id).toBe("tomorrow");
      expect(s.onNow).toBe(false);
      expect(s.current?.id).toBe("today");
    });

    it("multi-date default: tomorrow is next while today runs (unchanged)", () => {
      const s = resolveOccurrenceState(null, null, days, at("14:00"));
      expect(s.nextPurchasable?.id).toBe("tomorrow");
      expect(s.onNow).toBe(false);
    });

    it("validatePurchaseOccurrence accepts the running date until its cut-off", () => {
      const setting = { salesCloseBeforeEndMinutes: 60 };
      expect(
        validatePurchaseOccurrence("today", days, {
          ...setting,
          now: at("14:00"),
        }).ok,
      ).toBe(true);
      expect(
        validatePurchaseOccurrence("today", days, {
          ...setting,
          now: at("18:00"),
        }),
      ).toEqual({ ok: false, reason: "started" });
      expect(
        validatePurchaseOccurrence("yesterday", days, {
          ...setting,
          now: at("14:00"),
        }),
      ).toEqual({ ok: false, reason: "started" });
      // Without the setting the running date is refused, as before.
      expect(validatePurchaseOccurrence("today", days, at("14:00"))).toEqual({
        ok: false,
        reason: "started",
      });
    });

    // A run of shows is one event per show: each show is judged on its own
    // dates and its own setting (the setting is copied to new shows).
    it("run of shows: each show alone", () => {
      const show = (start: string, end: string) =>
        resolveOccurrenceState(
          `2026-11-23T${start}:00.000Z`,
          `2026-11-23T${end}:00.000Z`,
          null,
          { now: at("16:30"), salesCloseBeforeEndMinutes: 30 },
        );
      expect(show("16:00", "18:00").purchasable).toBe(true);
      expect(show("16:00", "17:00").purchasable).toBe(false);
      expect(show("20:00", "22:00").onNow).toBe(false);
      expect(show("20:00", "22:00").purchasable).toBe(true);
    });
  });

  describe("the setting's forms", () => {
    it("parses what a request sends", () => {
      expect(parseSalesClose(undefined)).toBeUndefined();
      expect(parseSalesClose(null)).toBeNull();
      expect(parseSalesClose(30)).toBe(30);
      expect(parseSalesClose(0)).toBe(0);
      expect(parseSalesClose(45)).toBe("invalid");
      expect(parseSalesClose("30")).toBe("invalid");
    });
    it("reads an event row, unknown values as the default", () => {
      expect(salesCloseOf({})).toBeNull();
      expect(salesCloseOf({ sales_close_before_end_minutes: null })).toBeNull();
      expect(salesCloseOf({ sales_close_before_end_minutes: 120 })).toBe(120);
      expect(salesCloseOf({ sales_close_before_end_minutes: 7 })).toBeNull();
    });
    it("round-trips every form choice", () => {
      for (const setting of SALES_CLOSE_CHOICES) {
        expect(salesCloseFromChoice(salesCloseChoice(setting))).toBe(setting);
      }
      expect(salesCloseChoice(null)).toBe("at_start");
      expect(salesCloseFromChoice("before_end:45")).toBe("invalid");
      expect(salesCloseFromChoice("whenever")).toBe("invalid");
    });
    it("names each choice by a code and a number", () => {
      expect(salesCloseLabel(null)).toEqual({ kind: "at_start" });
      expect(salesCloseLabel(0)).toEqual({ kind: "until_end" });
      expect(salesCloseLabel(30)).toEqual({
        kind: "minutes_before_end",
        minutes: 30,
      });
      expect(salesCloseLabel(120)).toEqual({
        kind: "hours_before_end",
        hours: 2,
      });
    });
    it("says the day only when the cut-off is not today on the event's clock", () => {
      const close = new Date(at("18:00"));
      const sameDay = salesCloseClock(close, "Africa/Accra", "fr", at("14:00"));
      expect(sameDay.day).toBeNull();
      expect(sameDay.time).toBe("18:00");
      const nextDay = salesCloseClock(
        close,
        "Africa/Accra",
        "fr",
        at("14:00") - 24 * 60 * 60 * 1000,
      );
      expect(nextDay.day).not.toBeNull();
    });
  });
});
