import type { ContentMediaItem } from "@abonten/types/contentType";

// The rules of the Spotlight feed's media lifecycle, kept free of React and
// native players so they can be tested. The app's playback layer
// (apps/mobile/src/features/content/playback) applies them.
//
// Every page in the feed is in exactly one mode:
//   * active  — the one page that may play and own the audio;
//   * preload — a direct neighbour: its player exists, the video is loaded
//               and its first frame is drawn, paused at 0:00, so a swipe
//               lands on a real frame that starts at once;
//   * idle    — everything else: a poster image and NO player, so the
//               number of native decoders never grows with scrolling.

export type FeedPlaybackMode = "active" | "preload" | "idle";

/** How many neighbours on each side keep a loaded, paused player. */
export const FEED_PRELOAD_AHEAD = 1;
export const FEED_PRELOAD_BEHIND = 1;

export function feedPlaybackMode(
  index: number,
  activeIndex: number,
  window: { ahead: number; behind: number } = {
    ahead: FEED_PRELOAD_AHEAD,
    behind: FEED_PRELOAD_BEHIND,
  },
): FeedPlaybackMode {
  if (activeIndex < 0) return "idle";
  if (index === activeIndex) return "active";
  const delta = index - activeIndex;
  if (delta > 0 && delta <= window.ahead) return "preload";
  if (delta < 0 && -delta <= window.behind) return "preload";
  return "idle";
}

/**
 * The URL to play and the one to fall back to. The optimised rendition is
 * preferred once the pipeline reports it ready; before that (or if it fails
 * to load) the original upload plays.
 */
export function feedVideoSources(media: ContentMediaItem | undefined): {
  primary: string | null;
  fallback: string | null;
} {
  if (!media || media.type !== "video")
    return { primary: null, fallback: null };
  const rendition =
    media.playbackStatus === "ready" && media.playbackUrl
      ? media.playbackUrl
      : null;
  const primary = rendition ?? media.mediaUrl ?? null;
  const fallback =
    media.mediaUrl && media.mediaUrl !== primary ? media.mediaUrl : null;
  return { primary, fallback };
}

/** The still shown until the video has drawn its own first frame. */
export function feedPosterUrl(
  media: ContentMediaItem | undefined,
): string | null {
  if (!media) return null;
  if (media.type === "video") return media.posterUrl ?? media.thumbnailUrl;
  return media.mediaUrl;
}

/** A page plays only when every one of these holds; any one pauses it. */
export function feedShouldPlay(input: {
  mode: FeedPlaybackMode;
  screenFocused: boolean;
  appActive: boolean;
  /** Something covers the video (an options sheet). */
  held: boolean;
  /** The person tapped to pause. */
  userPaused: boolean;
}): boolean {
  return (
    input.mode === "active" &&
    input.screenFocused &&
    input.appActive &&
    !input.held &&
    !input.userPaused
  );
}

/**
 * The page to treat as active after the list's content changed (refresh,
 * a hidden post): keep the same post if it is still there, otherwise the
 * page now at the same position, clamped to the list.
 */
export function reconcileActiveIndex(
  ids: readonly string[],
  activeId: string | null,
  previousIndex: number,
): number {
  if (ids.length === 0) return -1;
  if (activeId) {
    const at = ids.indexOf(activeId);
    if (at >= 0) return at;
  }
  return Math.min(Math.max(previousIndex, 0), ids.length - 1);
}
