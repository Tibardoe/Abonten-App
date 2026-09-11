import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getPlaceVisitPanelCore } from "@abonten/services/places/placeVisitCore";

// GET /api/mobile/organizer/places/:placeId/visit-code
// The place's check-in QR code right now (it changes every 30 seconds --
// call again at expiresAt) and today's / this month's visits. Owner only.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    return fromActionResult(
      await getPlaceVisitPanelCore(auth.supabase, auth.user.id, placeId),
    );
  } catch (error) {
    logger.error(
      "mobile GET /organizer/places/:placeId/visit-code failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
