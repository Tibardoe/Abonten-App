import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { refundAfterRescheduleCore } from "@abonten/services/events/eventRescheduleCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";

// POST /api/mobile/events/:eventId/reschedule/refund
// "Get a refund" after the event moved: the ticket price and the service fee, whatever the refund policy says, while the window is open.
// The same core as the web refundAfterReschedule action.
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
      await refundAfterRescheduleCore(auth.supabase, auth.user.id, eventId),
    );
  } catch (error) {
    logger.error(
      "mobile POST /events/:eventId/reschedule/refund failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
