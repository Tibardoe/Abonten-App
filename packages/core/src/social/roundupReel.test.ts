import { describe, expect, it } from "vitest";
import {
  REEL_MAX_MS,
  reelFileExtension,
  reelFrameAt,
  reelTimeline,
} from "./roundupReel";

describe("reelTimeline", () => {
  it("holds the cover 3 s and each event 2.5 s", () => {
    expect(reelTimeline(4)).toEqual({
      starts: [0, 3000, 5500, 8000],
      durations: [3000, 2500, 2500, 2500],
      totalMs: 10_500,
    });
  });

  it("stays within 30 seconds for a full roundup and beyond", () => {
    expect(reelTimeline(11).totalMs).toBe(28_000);
    const long = reelTimeline(31);
    expect(long.totalMs).toBeLessThanOrEqual(REEL_MAX_MS);
    expect(long.durations[1]).toBe(900);
  });

  it("is empty for no pictures, and the cover alone for one", () => {
    expect(reelTimeline(0).totalMs).toBe(0);
    expect(reelTimeline(1)).toEqual({
      starts: [0],
      durations: [3000],
      totalMs: 3000,
    });
  });
});

describe("reelFrameAt", () => {
  const timeline = reelTimeline(3); // 0–3000, 3000–5500, 5500–8000

  it("shows one slide outside a crossfade", () => {
    expect(reelFrameAt(timeline, 1000)).toEqual({
      index: 0,
      next: null,
      mix: 0,
    });
    expect(reelFrameAt(timeline, 4000)).toEqual({
      index: 1,
      next: null,
      mix: 0,
    });
  });

  it("fades the next slide in over the last 400 ms", () => {
    expect(reelFrameAt(timeline, 2800)).toEqual({
      index: 0,
      next: 1,
      mix: 0.5,
    });
    expect(reelFrameAt(timeline, 3000).index).toBe(1);
  });

  it("holds the last slide to the end, with nothing after it", () => {
    expect(reelFrameAt(timeline, 7900)).toEqual({
      index: 2,
      next: null,
      mix: 0,
    });
    expect(reelFrameAt(timeline, 9000).index).toBe(2);
  });
});

describe("reelFileExtension", () => {
  it("names MP4 and WebM", () => {
    expect(reelFileExtension("video/mp4;codecs=avc1.42E01E")).toBe("mp4");
    expect(reelFileExtension("video/webm;codecs=vp9")).toBe("webm");
  });
});
