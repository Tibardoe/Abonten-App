import type { ContentMediaItem } from "@abonten/types/contentType";
import { describe, expect, it } from "vitest";
import {
  feedPlaybackMode,
  feedPosterUrl,
  feedShouldPlay,
  feedVideoSources,
  reconcileActiveIndex,
} from "./feedPlayback";

function video(over: Partial<ContentMediaItem> = {}): ContentMediaItem {
  return {
    id: "m1",
    type: "video",
    publicId: "p",
    version: 1,
    width: 720,
    height: 1280,
    durationSeconds: 12,
    mediaUrl: "https://cdn/original.mp4",
    playbackUrl: "https://cdn/optimised.mp4",
    posterUrl: "https://cdn/poster.jpg",
    thumbnailUrl: "https://cdn/thumb.jpg",
    status: "ready",
    playbackStatus: "ready",
    position: 0,
    ...over,
  } as ContentMediaItem;
}

describe("feedPlaybackMode", () => {
  it("has exactly one active page and one preloaded neighbour each side", () => {
    const modes = [0, 1, 2, 3, 4, 5].map((i) => feedPlaybackMode(i, 2));
    expect(modes).toEqual([
      "idle",
      "preload",
      "active",
      "preload",
      "idle",
      "idle",
    ]);
    expect(modes.filter((m) => m === "active")).toHaveLength(1);
  });

  it("keeps at most three pages with a player however far you scroll", () => {
    for (let active = 0; active < 50; active += 1) {
      const withPlayer = Array.from({ length: 50 }, (_, i) =>
        feedPlaybackMode(i, active),
      ).filter((m) => m !== "idle");
      expect(withPlayer.length).toBeLessThanOrEqual(3);
    }
  });

  it("gives nothing a player when no page is active", () => {
    expect(feedPlaybackMode(0, -1)).toBe("idle");
  });
});

describe("feedVideoSources", () => {
  it("prefers the ready rendition and falls back to the original", () => {
    expect(feedVideoSources(video())).toEqual({
      primary: "https://cdn/optimised.mp4",
      fallback: "https://cdn/original.mp4",
    });
  });

  it("plays the original while the rendition is still processing", () => {
    expect(feedVideoSources(video({ playbackStatus: "pending" }))).toEqual({
      primary: "https://cdn/original.mp4",
      fallback: null,
    });
  });

  it("has no sources for a photo", () => {
    expect(feedVideoSources(video({ type: "image" }))).toEqual({
      primary: null,
      fallback: null,
    });
  });
});

describe("feedPosterUrl", () => {
  it("uses the poster, then the thumbnail, for video; the image itself for photos", () => {
    expect(feedPosterUrl(video())).toBe("https://cdn/poster.jpg");
    expect(feedPosterUrl(video({ posterUrl: null }))).toBe(
      "https://cdn/thumb.jpg",
    );
    expect(feedPosterUrl(video({ type: "image" }))).toBe(
      "https://cdn/original.mp4",
    );
  });
});

describe("feedShouldPlay", () => {
  const base = {
    mode: "active" as const,
    screenFocused: true,
    appActive: true,
    held: false,
    userPaused: false,
  };

  it("plays only the active page while everything allows it", () => {
    expect(feedShouldPlay(base)).toBe(true);
    expect(feedShouldPlay({ ...base, mode: "preload" })).toBe(false);
    expect(feedShouldPlay({ ...base, screenFocused: false })).toBe(false);
    expect(feedShouldPlay({ ...base, appActive: false })).toBe(false);
    expect(feedShouldPlay({ ...base, held: true })).toBe(false);
    expect(feedShouldPlay({ ...base, userPaused: true })).toBe(false);
  });
});

describe("reconcileActiveIndex", () => {
  it("follows the same post when it moved", () => {
    expect(reconcileActiveIndex(["a", "b", "c"], "c", 0)).toBe(2);
  });

  it("stays at the same position when the post is gone, clamped", () => {
    expect(reconcileActiveIndex(["a", "b"], "z", 1)).toBe(1);
    expect(reconcileActiveIndex(["a", "b"], "z", 7)).toBe(1);
    expect(reconcileActiveIndex([], "a", 0)).toBe(-1);
  });
});
