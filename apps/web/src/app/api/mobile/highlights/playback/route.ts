import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { prepareHighlightVideoDelivery } from "@abonten/services/uploads/highlightVideoDelivery";

// POST /api/mobile/highlights/playback
//   { publicId, version, width, height, bytes, durationSeconds, trim? }
//
// Asks Cloudinary to build an optimised playback rendition for a highlight
// video the caller has just uploaded, and returns its URL (plus a poster).
//
// This exists because the derivation needs CLOUDINARY_API_SECRET, which only
// the server has -- apps/mobile uploads straight to Cloudinary with a signed
// request and then inserts the `highlight` row itself under RLS, so it has
// nowhere else to run this step. The web Server Action calls the same shared
// service, so both transports produce identical delivery URLs.
//
// A null playbackUrl is a normal, successful outcome: it means the source was
// already within the playback profile and the original should be served as-is.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      publicId?: unknown;
      version?: unknown;
      width?: unknown;
      height?: unknown;
      bytes?: unknown;
      durationSeconds?: unknown;
      trim?: { start?: unknown; end?: unknown } | null;
    } | null;

    if (typeof body?.publicId !== "string" || body.publicId.length === 0) {
      return apiJson({ status: 400, message: "publicId is required" });
    }

    // Same ownership rule the web uploadHighlight action enforces: the signed
    // upload bound the folder to the caller's own user id, so a publicId
    // outside that folder could not have come from a legitimate upload.
    if (!body.publicId.startsWith(`highlight_media/${auth.user.id}/`)) {
      return apiJson({ status: 403, message: "Not authorized for this media" });
    }

    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;

    const trimStart = num(body.trim?.start);
    const trimEnd = num(body.trim?.end);
    const trim =
      trimStart !== null && trimEnd !== null && trimEnd > trimStart
        ? { start: trimStart, end: trimEnd }
        : null;

    const delivery = await prepareHighlightVideoDelivery({
      publicId: body.publicId,
      version: num(body.version) ?? 0,
      width: num(body.width),
      height: num(body.height),
      bytes: num(body.bytes),
      durationSeconds: num(body.durationSeconds),
      trim,
    });

    return apiJson({ status: 200, data: delivery });
  } catch (error) {
    logger.error("mobile POST /highlights/playback failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
