// Which URL a highlight video should actually be played from.
//
// `playback_url` is the optimised rendition built at upload time; `media_url`
// is always the original, which is immediately playable. Because the
// derivation runs in the background (it can take seconds -- measured up to
// 17 s for a 4.8 MB clip on this account), a viewer who opens a highlight
// within moments of it being uploaded can reach the optimised URL before
// Cloudinary has finished building it, which answers 423. The players call
// this first, then fall back via `fallbackPlaybackSource` on a load error, so
// a viewer is never shown a broken video.

export type HighlightPlaybackSource = {
  media_url: string;
  playback_url?: string | null;
};

/** Preferred source: the optimised rendition when one exists. */
export function playbackSourceFor(slide: HighlightPlaybackSource): string {
  return slide.playback_url ?? slide.media_url;
}

/**
 * The URL to retry with after `current` failed to load, or null when there is
 * nothing left to try (so the caller shows a real error rather than looping).
 */
export function fallbackPlaybackSource(
  slide: HighlightPlaybackSource,
  current: string,
): string | null {
  if (slide.playback_url && current === slide.playback_url) {
    return slide.media_url;
  }
  return null;
}
