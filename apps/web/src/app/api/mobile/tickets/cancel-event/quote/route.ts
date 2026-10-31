import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { eventCancelQuoteCore } from "@abonten/services/tickets/cancelEventTicketsCore";

// POST /api/mobile/tickets/cancel-event/quote  { eventId: string }
//
// What cancelling all of the caller's tickets for the event would give
// back. Same eventCancelQuoteCore as the web getEventCancelQuote action.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      eventId?: unknown;
    } | null;
    if (typeof body?.eventId !== "string" || body.eventId.length === 0) {
      return apiJson({ status: 400, message: tr("somethingWentWrong") });
    }

    return apiJson(
      await eventCancelQuoteCore(auth.supabase, auth.user.id, body.eventId),
    );
  } catch (error) {
    logger.error("mobile POST /tickets/cancel-event/quote failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
