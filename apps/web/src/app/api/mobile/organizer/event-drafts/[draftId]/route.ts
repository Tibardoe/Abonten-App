import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { fetchEventDraftDetail } from "@/utils/eventDraftCore";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/event-drafts/:draftId
// The full jsonb payload + flyer ids for one of the caller's event drafts,
// for resuming it in the wizard. 404 if not the caller's, 410 if expired.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { draftId } = await params;
    const result = await fetchEventDraftDetail(
      auth.supabase,
      auth.user.id,
      draftId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/event-drafts/:draftId failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
