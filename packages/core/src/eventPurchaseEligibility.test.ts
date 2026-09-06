import { describe, expect, it } from "vitest";
import {
  resolveOccurrenceState,
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
