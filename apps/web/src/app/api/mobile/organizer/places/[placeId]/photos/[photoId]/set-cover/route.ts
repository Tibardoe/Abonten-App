import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { setPlaceCoverFromPhotoCore } from "@abonten/services/places/placePhotoCore";

// POST /api/mobile/organizer/places/:placeId/photos/:photoId/set-cover
// Promotes an existing gallery photo to the place's cover. 403 unless the
// caller owns the place.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string; photoId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId, photoId } = await params;
    const result = await setPlaceCoverFromPhotoCore(
      auth.supabase,
      auth.user.id,
      placeId,
      photoId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/places/:id/photos/:photoId/set-cover failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
