import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { ticketCancelQuoteCore } from "@abonten/services/tickets/ticketCancelQuoteCore";

// POST /api/mobile/tickets/cancel/quote  { ticketId: string }
//
// What cancelling one of the caller's tickets would give back, and which of
// the payment's other tickets would go with it — asked before the cancel
// dialog opens. Same ticketCancelQuoteCore as the web getTicketCancelQuote.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      ticketId?: unknown;
    } | null;

    if (typeof body?.ticketId !== "string" || body.ticketId.length === 0) {
      return apiJson({ status: 400, message: tr("ticketidIsRequired") });
    }

    return apiJson(
      await ticketCancelQuoteCore(auth.supabase, auth.user.id, body.ticketId),
    );
  } catch (error) {
    logger.error("mobile POST /tickets/cancel/quote failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
