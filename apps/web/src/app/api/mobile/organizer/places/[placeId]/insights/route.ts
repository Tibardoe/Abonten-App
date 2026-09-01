import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { fetchPlaceInsights } from "@/utils/organizerReadQuery";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/places/:placeId/insights
// Owner-only stat counts for one place (views / directions / phone /
// whatsapp / favorites / reviews) — same body as getPlaceInsights. 404 if
// the place isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const result = await fetchPlaceInsights(
      auth.supabase,
      auth.user.id,
      placeId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/places/:id/insights failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
