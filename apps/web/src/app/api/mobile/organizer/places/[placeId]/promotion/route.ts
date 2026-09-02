import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { fetchPlacePromotionContext } from "@abonten/services/places/placePromotionCore";

// GET /api/mobile/organizer/places/:placeId/promotion
// The Promotion tab payload: seeded tiers + the current active promotion
// (if any). 403 if the place isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    if (!placeId) {
      return apiJson({ status: 400, message: "Missing place id" });
    }

    const result = await fetchPlacePromotionContext(
      auth.supabase,
      auth.user.id,
      placeId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile GET /organizer/places/:placeId/promotion failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
