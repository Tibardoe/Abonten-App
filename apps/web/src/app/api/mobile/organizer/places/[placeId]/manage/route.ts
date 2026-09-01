import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { fetchPlaceManageContext } from "@/utils/placeManageContextQuery";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/places/:placeId/manage
// The caller's own place row (editable fields), its weekly opening hours,
// and its services — one read to prefill the per-place management forms.
// 404 if the place isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const result = await fetchPlaceManageContext(
      auth.supabase,
      auth.user.id,
      placeId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/places/:id/manage failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
