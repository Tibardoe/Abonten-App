import { describe, expect, it } from "vitest";
import {
  formatPlaybackTime,
  formatSpeed,
  holdRate,
  scrubTarget,
} from "./playbackControls";

describe("holdRate", () => {
  it("boosts to 2× without ever slowing a faster choice", () => {
    expect(holdRate(1)).toBe(2);
    expect(holdRate(0.5)).toBe(2);
    expect(holdRate(2)).toBe(2);
  });
});

describe("formatSpeed / formatPlaybackTime", () => {
  it("labels speeds and times", () => {
    expect(formatSpeed(1)).toBe("1×");
    expect(formatSpeed(1.25)).toBe("1.25×");
    expect(formatSpeed(0.5)).toBe("0.5×");
    expect(formatPlaybackTime(0)).toBe("0:00");
    expect(formatPlaybackTime(7.9)).toBe("0:07");
    expect(formatPlaybackTime(65)).toBe("1:05");
    expect(formatPlaybackTime(Number.NaN)).toBe("0:00");
    expect(formatPlaybackTime(-3)).toBe("0:00");
  });
});

describe("scrubTarget", () => {
  it("maps the finger onto the clip, clamped inside it", () => {
    expect(scrubTarget(50, 100, 20)).toBe(10);
    expect(scrubTarget(-10, 100, 20)).toBe(0);
    expect(scrubTarget(500, 100, 20)).toBeCloseTo(19.95);
  });

  it("refuses clips it can't place a finger on", () => {
    expect(scrubTarget(50, 100, 0)).toBeNull();
    expect(scrubTarget(50, 100, 0.3)).toBeNull();
    expect(scrubTarget(50, 100, Number.NaN)).toBeNull();
    expect(scrubTarget(50, 0, 20)).toBeNull();
  });
});
