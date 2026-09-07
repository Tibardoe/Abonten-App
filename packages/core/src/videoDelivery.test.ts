import { describe, expect, it } from "vitest";
import {
  OPTIMIZE_BITRATE_THRESHOLD,
  PLAYBACK_MAX_EDGE,
  averageBitrate,
  buildEagerTransformations,
  shouldOptimizeVideo,
} from "./videoDelivery";

describe("averageBitrate", () => {
  it("computes bits per second from bytes and duration", () => {
    // 1 MB over 8 seconds = 1 Mbps
    expect(averageBitrate({ bytes: 1_000_000, durationSeconds: 8 })).toBe(
      1_000_000,
    );
  });

  it("returns null when it cannot be derived", () => {
    expect(averageBitrate({ bytes: 0, durationSeconds: 10 })).toBeNull();
    expect(averageBitrate({ bytes: 100, durationSeconds: 0 })).toBeNull();
    expect(averageBitrate({})).toBeNull();
  });
});

describe("shouldOptimizeVideo", () => {
  // These three are the real highlight videos measured against this
  // project's Cloudinary account. Re-encoding them saved little or, in the
  // third case, produced a LARGER file -- so all three must be skipped.
  it("skips the real clips where re-encoding measured as not worth it", () => {
    expect(
      shouldOptimizeVideo({
        width: 576,
        height: 1024,
        bytes: 5_023_437,
        durationSeconds: 31.07,
      }),
    ).toBe(false);

    expect(
      shouldOptimizeVideo({
        width: 496,
        height: 480,
        bytes: 377_487,
        durationSeconds: 9.87,
      }),
    ).toBe(false);

    // This one came out 9.1% larger when transcoded.
    expect(
      shouldOptimizeVideo({
        width: 576,
        height: 576,
        bytes: 597_688,
        durationSeconds: 8.0,
      }),
    ).toBe(false);
  });

  it("optimizes a 1080p phone clip (long edge over the profile)", () => {
    expect(
      shouldOptimizeVideo({
        width: 1080,
        height: 1920,
        bytes: 30_000_000,
        durationSeconds: 30,
      }),
    ).toBe(true);
  });

  it("optimizes a 4K clip", () => {
    expect(
      shouldOptimizeVideo({
        width: 3840,
        height: 2160,
        bytes: 80_000_000,
        durationSeconds: 20,
      }),
    ).toBe(true);
  });

  it("optimizes a high-bitrate clip even when it is within the size profile", () => {
    // 720x1280 but 4 Mbps -- resolution is fine, bitrate is not.
    expect(
      shouldOptimizeVideo({
        width: 720,
        height: 1280,
        bytes: (4_000_000 / 8) * 20,
        durationSeconds: 20,
      }),
    ).toBe(true);
  });

  it("treats the long edge in either orientation", () => {
    const over = PLAYBACK_MAX_EDGE + 1;
    expect(shouldOptimizeVideo({ width: over, height: 100 })).toBe(true);
    expect(shouldOptimizeVideo({ width: 100, height: over })).toBe(true);
    expect(shouldOptimizeVideo({ width: PLAYBACK_MAX_EDGE, height: 100 })).toBe(
      false,
    );
  });

  it("does not optimize when metadata is missing rather than guessing", () => {
    expect(shouldOptimizeVideo({})).toBe(false);
  });

  it("sits exactly on the documented bitrate threshold", () => {
    const atThreshold = {
      width: 100,
      height: 100,
      bytes: (OPTIMIZE_BITRATE_THRESHOLD / 8) * 10,
      durationSeconds: 10,
    };
    expect(shouldOptimizeVideo(atThreshold)).toBe(false);
    expect(
      shouldOptimizeVideo({ ...atThreshold, bytes: atThreshold.bytes + 1000 }),
    ).toBe(true);
  });
});

describe("buildEagerTransformations", () => {
  it("returns playback first, poster second", () => {
    const [playback, poster] = buildEagerTransformations();
    expect(playback.format).toBe("mp4");
    expect(playback.crop).toBe("limit");
    expect(poster.format).toBe("jpg");
    expect(poster.start_offset).toBe("0");
  });

  it("bakes the trim window into both renditions", () => {
    const [playback, poster] = buildEagerTransformations({ start: 2, end: 9 });
    expect(playback.start_offset).toBe("2");
    expect(playback.end_offset).toBe("9");
    // the poster must come from inside the trimmed range, not frame 0
    expect(poster.start_offset).toBe("2");
  });

  it("never upscales (c_limit) so a small source is left alone", () => {
    const [playback] = buildEagerTransformations();
    expect(playback.crop).toBe("limit");
    expect(playback.width).toBe(PLAYBACK_MAX_EDGE);
    expect(playback.height).toBe(PLAYBACK_MAX_EDGE);
  });
});
