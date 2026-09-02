import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { fetchPlaceDraftDetail } from "@/utils/placeDraftCore";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/place-drafts/:draftId
// The full jsonb payload + cover ids for one of the caller's place drafts,
// for resuming it in the wizard. 404 if not the caller's, 410 if expired.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { draftId } = await params;
    const result = await fetchPlaceDraftDetail(
      auth.supabase,
      auth.user.id,
      draftId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/place-drafts/:draftId failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
