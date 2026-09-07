// Playback profile for highlight videos, and the decision of whether a given
// source is worth re-encoding at all.
//
// Framework-free so the web upload action, the mobile HTTP route and the
// players can all agree on one definition.
//
// WHY A DECISION FUNCTION RATHER THAN "ALWAYS TRANSCODE". Measured against
// this project's own Cloudinary account on three real highlight videos:
//
//   source                       sync derive   result
//   576x1024 4.79 MB 1.29 Mbps     16,960 ms   18.7% smaller
//   496x480  0.36 MB 0.31 Mbps      1,810 ms   40.9% smaller (of 0.36 MB)
//   576x576  0.57 MB 0.60 Mbps      2,337 ms    9.1% LARGER
//
// Re-encoding an already-small, already-low-bitrate phone clip can cost more
// bytes than it saves, on top of the derivation time and the storage. The win
// is real only for sources that genuinely exceed the playback profile -- a
// 1080p or 4K clip straight off a modern phone, which is exactly the case the
// performance audit was worried about. All three clips above are correctly
// skipped by shouldOptimizeVideo().

/** Long edge of the playback rendition. 720p-class: plenty for a phone. */
export const PLAYBACK_MAX_EDGE = 1280;

/** Hard ceiling on the playback bitrate, to tame pathological sources. */
export const PLAYBACK_MAX_BITRATE = "2m";

/**
 * Cloudinary eager-transformation object for the playback rendition.
 * `c_limit` never upscales and preserves aspect ratio, so one profile covers
 * portrait and landscape. `f_mp4` + `vc_auto` resolves to H.264, which every
 * target (Android ExoPlayer, iOS AVPlayer, every browser) plays natively.
 */
export const PLAYBACK_TRANSFORMATION = {
  format: "mp4",
  video_codec: "auto",
  quality: "auto:good",
  width: PLAYBACK_MAX_EDGE,
  height: PLAYBACK_MAX_EDGE,
  crop: "limit",
  bit_rate: PLAYBACK_MAX_BITRATE,
} as const;

/** Poster frame shown before playback starts. */
export const POSTER_TRANSFORMATION = {
  format: "jpg",
  quality: "auto",
  width: 720,
  height: 1280,
  crop: "limit",
} as const;

export type VideoSource = {
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  durationSeconds?: number | null;
};

/** Average bitrate in bits per second, or null when it can't be derived. */
export function averageBitrate(source: VideoSource): number | null {
  const { bytes, durationSeconds } = source;
  if (!bytes || !durationSeconds || durationSeconds <= 0) return null;
  return (bytes * 8) / durationSeconds;
}

/** Above this average bitrate, a 2 Mbps re-encode is a clear win. */
export const OPTIMIZE_BITRATE_THRESHOLD = 2_500_000;

/**
 * True when re-encoding to the playback profile should actually make the
 * video meaningfully cheaper to stream.
 *
 * Deliberately conservative: when the source is already within the profile,
 * the original is served untouched -- no derivation cost, no storage cost,
 * and no risk of shipping a *larger* file than the user uploaded.
 */
export function shouldOptimizeVideo(source: VideoSource): boolean {
  const longEdge = Math.max(source.width ?? 0, source.height ?? 0);
  if (longEdge > PLAYBACK_MAX_EDGE) return true;

  const bitrate = averageBitrate(source);
  if (bitrate !== null && bitrate > OPTIMIZE_BITRATE_THRESHOLD) return true;

  return false;
}

/**
 * The transformation list to request eagerly for one video, including the
 * trim window when the editor set one so the derived asset *is* the trimmed
 * clip. Returns the playback rendition first, the poster second.
 */
export function buildEagerTransformations(trim?: {
  start: number;
  end: number;
}): Record<string, unknown>[] {
  const playback: Record<string, unknown> = { ...PLAYBACK_TRANSFORMATION };
  const poster: Record<string, unknown> = {
    ...POSTER_TRANSFORMATION,
    start_offset: trim ? String(trim.start) : "0",
  };
  if (trim) {
    playback.start_offset = String(trim.start);
    playback.end_offset = String(trim.end);
  }
  return [playback, poster];
}
