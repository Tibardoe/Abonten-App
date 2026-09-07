import { describe, expect, it } from "vitest";
import { fallbackPlaybackSource, playbackSourceFor } from "./highlightPlayback";

const ORIGINAL = "https://res.cloudinary.com/abonten/video/upload/v1/a.mp4";
const OPTIMISED =
  "https://res.cloudinary.com/abonten/video/upload/q_auto/v1/a.mp4";

describe("playbackSourceFor", () => {
  it("prefers the optimised rendition when there is one", () => {
    expect(
      playbackSourceFor({ media_url: ORIGINAL, playback_url: OPTIMISED }),
    ).toBe(OPTIMISED);
  });

  it("uses the original when no rendition was built", () => {
    expect(playbackSourceFor({ media_url: ORIGINAL })).toBe(ORIGINAL);
    expect(playbackSourceFor({ media_url: ORIGINAL, playback_url: null })).toBe(
      ORIGINAL,
    );
  });
});

describe("fallbackPlaybackSource", () => {
  it("falls back to the original when the optimised one failed", () => {
    expect(
      fallbackPlaybackSource(
        { media_url: ORIGINAL, playback_url: OPTIMISED },
        OPTIMISED,
      ),
    ).toBe(ORIGINAL);
  });

  it("does not loop once the original has already failed", () => {
    expect(
      fallbackPlaybackSource(
        { media_url: ORIGINAL, playback_url: OPTIMISED },
        ORIGINAL,
      ),
    ).toBeNull();
  });

  it("has nothing to fall back to when there was no rendition", () => {
    expect(
      fallbackPlaybackSource({ media_url: ORIGINAL }, ORIGINAL),
    ).toBeNull();
  });
});
