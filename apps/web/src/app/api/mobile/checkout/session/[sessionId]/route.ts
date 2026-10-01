import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getTicketCheckoutCore } from "@abonten/services/checkout/getTicketCheckoutCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";

// GET /api/mobile/checkout/session/<checkoutSessionId>
//
// The caller's rows for one checkout session (line items + joined event /
// ticket-type). Self-heals stale-pending rows first, same as the web
// getTicketCheckout action.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { sessionId } = await ctx.params;

    if (!sessionId) {
      return apiJson({
        status: 400,
        message: tr("sessionidIsRequired"),
      });
    }

    const result = await getTicketCheckoutCore(
      auth.supabase,
      auth.user.id,
      sessionId,
    );

    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /checkout/session failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
