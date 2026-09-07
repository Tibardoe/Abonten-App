import { logger } from "@abonten/core/logger";
import {
  buildEagerTransformations,
  shouldOptimizeVideo,
} from "@abonten/core/videoDelivery";
import { v2 as cloudinary } from "cloudinary";

// Server-side step that gives a highlight video an optimised playback
// rendition. Shared by the web `uploadHighlight` Server Action and the mobile
// `/api/mobile/highlights/playback` route, so both transports produce
// identical delivery URLs -- no logic fork.
//
// It runs AFTER the bytes have already gone browser/app -> Cloudinary. It
// deliberately does not touch the upload signature: this repo has a
// documented incident (2026-09-05) where adding one unrecognised signed
// upload param made Cloudinary's signature check fail and broke 100% of
// uploads across every surface. Requesting the derivation separately, with
// the API secret that already lives on the server, keeps the upload path
// byte-for-byte unchanged.
//
// The derivation is asynchronous (`eager_async: true`). Measured on this
// account, a synchronous derive took 1.8 s for a 0.36 MB clip and 17.0 s for
// a 4.8 MB one, against a 90 MB upload ceiling -- far too slow to block a
// request on. Cloudinary returns the eager URLs immediately and builds them
// in the background, so the URL is stable and can be persisted right away;
// the players fall back to the original while it is still building.

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type HighlightVideoSource = {
  publicId: string;
  version: number;
  width?: number | null;
  height?: number | null;
  bytes?: number | null;
  durationSeconds?: number | null;
  /** Trim window set by the editor, when it is a real strict sub-range. */
  trim?: { start: number; end: number } | null;
};

export type HighlightVideoDelivery = {
  /**
   * URL of the optimised rendition, or null when the source is already within
   * the playback profile (or the request failed). Null is a normal outcome,
   * not an error: the caller keeps serving the original.
   */
  playbackUrl: string | null;
  /** Poster frame, when one was generated alongside the playback rendition. */
  posterUrl: string | null;
};

const NONE: HighlightVideoDelivery = { playbackUrl: null, posterUrl: null };

/**
 * Ask Cloudinary to build the playback rendition + poster for one already
 * uploaded video, and return their URLs.
 *
 * Never throws. A Cloudinary failure here must not fail the upload the user
 * just completed -- the original clip is already stored and playable, so the
 * worst case is simply that this highlight is served unoptimised.
 */
export async function prepareHighlightVideoDelivery(
  source: HighlightVideoSource,
): Promise<HighlightVideoDelivery> {
  if (
    !shouldOptimizeVideo({
      width: source.width,
      height: source.height,
      bytes: source.bytes,
      durationSeconds: source.durationSeconds,
    })
  ) {
    return NONE;
  }

  try {
    const result = await cloudinary.uploader.explicit(source.publicId, {
      resource_type: "video",
      type: "upload",
      eager: buildEagerTransformations(source.trim ?? undefined),
      // Build in the background -- see the timing note above.
      eager_async: true,
      invalidate: false,
    });

    const eager = (result?.eager ?? []) as { secure_url?: string }[];
    return {
      playbackUrl: eager[0]?.secure_url ?? null,
      posterUrl: eager[1]?.secure_url ?? null,
    };
  } catch (error) {
    logger.error(
      `Highlight video derivation failed for ${source.publicId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return NONE;
  }
}
