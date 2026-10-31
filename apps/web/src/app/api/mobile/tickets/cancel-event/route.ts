import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { cancelEventTicketsCore } from "@abonten/services/tickets/cancelEventTicketsCore";

// POST /api/mobile/tickets/cancel-event  { eventId: string }
//
// Cancels every active ticket the caller holds for the event and requests
// the refund of each payment's share. Same cancelEventTicketsCore as the web
// cancelEventTickets action.
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

    const result = await cancelEventTicketsCore(
      auth.supabase,
      auth.user.id,
      body.eventId,
    );
    return apiJson({ status: result.status, message: result.message });
  } catch (error) {
    logger.error("mobile POST /tickets/cancel-event failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
