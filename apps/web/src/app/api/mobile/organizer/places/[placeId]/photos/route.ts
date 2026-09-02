import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { addPlacePhotoCore } from "@abonten/services/places/placePhotoCore";

// POST /api/mobile/organizer/places/:placeId/photos  { publicId, version }
// Records one gallery photo after it finished uploading straight to
// Cloudinary (kind "place_photo"). Same body as addPlacePhoto. 403 if the
// publicId isn't in this caller's place_photos folder.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const body = (await req.json().catch(() => null)) as {
      publicId?: unknown;
      version?: unknown;
    } | null;

    const publicId =
      typeof body?.publicId === "string" && body.publicId.length > 0
        ? body.publicId
        : null;
    const version =
      body?.version === undefined || body?.version === null
        ? null
        : String(body.version);

    if (!publicId || !version) {
      return apiJson({
        status: 400,
        message: "publicId and version are required",
      });
    }

    const result = await addPlacePhotoCore(
      auth.supabase,
      auth.user.id,
      placeId,
      publicId,
      version,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/places/:id/photos failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
