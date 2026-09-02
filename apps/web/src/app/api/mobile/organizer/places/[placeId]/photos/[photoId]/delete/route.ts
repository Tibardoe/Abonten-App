import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { removePlacePhotoCore } from "@abonten/services/places/placePhotoCore";

// POST /api/mobile/organizer/places/:placeId/photos/:photoId/delete
// Deletes the place_photo row + best-effort Cloudinary asset. Same body as
// removePlacePhoto. 403 unless the caller owns the photo's place.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string; photoId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { photoId } = await params;
    const result = await removePlacePhotoCore(
      auth.supabase,
      auth.user.id,
      photoId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/places/:id/photos/:photoId/delete failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
