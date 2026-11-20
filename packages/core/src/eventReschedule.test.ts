import { describe, expect, it } from "vitest";
import {
  MAX_RESCHEDULES,
  rescheduleMessageProblem,
  rescheduleProblem,
  rescheduleRefundOpen,
  rescheduleRefundUntil,
} from "./eventReschedule";

const now = new Date("2026-11-20T12:00:00Z");
const at = (iso: string) => new Date(iso);

describe("moving an event", () => {
  const base = {
    startsAt: at("2026-12-10T18:00:00Z"),
    endsAt: at("2026-12-10T21:00:00Z"),
    message: "The venue flooded; same tickets, new date.",
    currentStartsAt: at("2026-12-03T18:00:00Z"),
    currentEndsAt: at("2026-12-03T21:00:00Z"),
    moves: 0,
    now,
  };

  it("accepts a later date with a message", () => {
    expect(rescheduleProblem(base)).toBeNull();
  });

  it("refuses what the database refuses", () => {
    expect(rescheduleProblem({ ...base, moves: MAX_RESCHEDULES })).toBe(
      "too_many",
    );
    expect(rescheduleProblem({ ...base, endsAt: base.startsAt })).toBe("dates");
    expect(rescheduleProblem({ ...base, startsAt: null })).toBe("dates");
    expect(
      rescheduleProblem({
        ...base,
        startsAt: at("2026-11-20T13:30:00Z"),
        endsAt: at("2026-11-20T15:00:00Z"),
      }),
    ).toBe("too_soon");
    expect(
      rescheduleProblem({
        ...base,
        startsAt: base.currentStartsAt,
        endsAt: base.currentEndsAt,
      }),
    ).toBe("unchanged");
    expect(rescheduleProblem({ ...base, message: "   " })).toBe("message");
    expect(rescheduleProblem({ ...base, message: "x".repeat(1001) })).toBe(
      "message",
    );
  });

  it("gives holders 7 days, ending 48 hours before the new date, never under a day", () => {
    // Far away: 7 days.
    expect(
      rescheduleRefundUntil(at("2026-12-20T18:00:00Z"), now).toISOString(),
    ).toBe("2026-11-27T12:00:00.000Z");
    // Five days away: 48 hours before it.
    expect(
      rescheduleRefundUntil(at("2026-11-25T18:00:00Z"), now).toISOString(),
    ).toBe("2026-11-23T18:00:00.000Z");
    // Two days away: still a day.
    expect(
      rescheduleRefundUntil(at("2026-11-22T10:00:00Z"), now).toISOString(),
    ).toBe("2026-11-21T12:00:00.000Z");
    // Five hours away: until the new start.
    expect(
      rescheduleRefundUntil(at("2026-11-20T17:00:00Z"), now).toISOString(),
    ).toBe("2026-11-20T17:00:00.000Z");
  });

  it("lets the same date stand when the venue changes or the event was postponed", () => {
    const same = {
      ...base,
      startsAt: base.currentStartsAt,
      endsAt: base.currentEndsAt,
    };
    expect(rescheduleProblem(same)).toBe("unchanged");
    expect(rescheduleProblem({ ...same, sameDateAllowed: true })).toBeNull();
    // A postponed event's new date, whatever its old one was.
    expect(
      rescheduleProblem({
        ...base,
        currentStartsAt: null,
        currentEndsAt: null,
      }),
    ).toBeNull();
  });

  it("asks every move and postponement for a message", () => {
    expect(
      rescheduleMessageProblem("Postponed: the artist is ill."),
    ).toBeNull();
    expect(rescheduleMessageProblem("  ")).toBe("message");
  });

  it("knows when the window is open", () => {
    expect(rescheduleRefundOpen("2026-11-21T12:00:00Z", now)).toBe(true);
    expect(rescheduleRefundOpen("2026-11-20T11:59:00Z", now)).toBe(false);
    expect(rescheduleRefundOpen("not a date", now)).toBe(false);
  });
});
