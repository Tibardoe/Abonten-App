import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { keepTicketsAfterRescheduleCore } from "@abonten/services/events/eventRescheduleCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";

// POST /api/mobile/events/:eventId/reschedule/keep
// "Keep my tickets" after the event moved.
// The same core as the web keepTicketsAfterReschedule action.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { eventId } = await params;
    return apiJson(
      await keepTicketsAfterRescheduleCore(
        auth.supabase,
        auth.user.id,
        eventId,
      ),
    );
  } catch (error) {
    logger.error("mobile POST /events/:eventId/reschedule/keep failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
