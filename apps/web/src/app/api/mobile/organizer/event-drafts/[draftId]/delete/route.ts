import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { deleteEventDraftCore } from "@abonten/services/events/eventDraftCore";

// POST /api/mobile/organizer/event-drafts/:draftId/delete
// Deletes one event draft (row + best-effort Cloudinary flyer, Cloudinary
// first). Same body as deleteEventDraft. 404 unless it's the caller's.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { draftId } = await params;
    const result = await deleteEventDraftCore(
      auth.supabase,
      auth.user.id,
      draftId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/event-drafts/:draftId/delete failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
