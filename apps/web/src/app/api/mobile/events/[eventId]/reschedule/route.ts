import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getEventRescheduleForHolderCore } from "@abonten/services/events/eventRescheduleCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";

// GET /api/mobile/events/:eventId/reschedule
//   → the latest move as the signed-in holder sees it (null when none):
//     old and new dates, the organizer's message, the refund window, the
//     holder's choice and what giving the tickets back returns.
// The same core as the web getEventReschedule action.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { eventId } = await params;
    return fromActionResult(
      await getEventRescheduleForHolderCore(
        auth.supabase,
        auth.user.id,
        eventId,
      ),
    );
  } catch (error) {
    logger.error("mobile GET /events/:eventId/reschedule failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
