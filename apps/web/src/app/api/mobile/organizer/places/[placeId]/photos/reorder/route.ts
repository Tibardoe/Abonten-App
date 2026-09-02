import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { reorderPlacePhotosCore } from "@/utils/placePhotoCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/places/:placeId/photos/reorder  { photoIds: string[] }
// Sets each photo's `position` to its index in `photoIds`. Same body as
// reorderPlacePhotos. 404 unless the place is the caller's.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const body = (await req.json().catch(() => null)) as {
      photoIds?: unknown;
    } | null;

    const photoIds = Array.isArray(body?.photoIds)
      ? body.photoIds.filter((id): id is string => typeof id === "string")
      : null;

    if (!photoIds || photoIds.length === 0) {
      return apiJson({
        status: 400,
        message: "photoIds (non-empty string array) is required",
      });
    }

    const result = await reorderPlacePhotosCore(
      auth.supabase,
      auth.user.id,
      placeId,
      photoIds,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/places/:id/photos/reorder failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
