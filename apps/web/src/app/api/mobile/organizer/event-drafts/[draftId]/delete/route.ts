import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { deleteEventDraftCore } from "@abonten/services/events/eventDraftCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";

// POST /api/mobile/organizer/event-drafts/:draftId/delete
// Deletes one event draft (row + best-effort Cloudinary flyer, Cloudinary
// first). Same body as deleteEventDraft. 404 unless it's the caller's.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the named team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "events.manage");
  if (actor.error) return apiJson(actor.error);

  try {
    const { draftId } = await params;
    const result = await deleteEventDraftCore(
      auth.supabase,
      actor.accountId,
      draftId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/event-drafts/:draftId/delete failed",
      error,
    );
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
