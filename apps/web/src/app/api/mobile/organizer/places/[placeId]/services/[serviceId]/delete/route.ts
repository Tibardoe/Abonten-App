import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { removePlaceServiceCore } from "@/utils/placeServiceCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/places/:placeId/services/:serviceId/delete
// Removes one service — same body as removePlaceService. POST for the
// mutation, matching the promo-codes/delete precedent. 403 unless the
// caller owns the service's place.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string; serviceId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { serviceId } = await params;
    const result = await removePlaceServiceCore(
      auth.supabase,
      auth.user.id,
      serviceId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/places/:id/services/:serviceId/delete failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
