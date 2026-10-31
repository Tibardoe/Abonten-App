import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { issueRefundCore } from "@abonten/services/organizer/issueRefundCore";

// POST /api/mobile/tickets/refund  { transactionId: string }
//
// Asks again for the refund of the caller's cancelled tickets on that
// payment: a refused one, or one never asked for. Same issueRefundCore as
// the web issueRefund action (scoped to the caller's own payment).
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      transactionId?: unknown;
    } | null;

    if (
      typeof body?.transactionId !== "string" ||
      body.transactionId.length === 0
    ) {
      return apiJson({ status: 400, message: tr("somethingWentWrong") });
    }

    const result = await issueRefundCore(auth.supabase, body.transactionId, {
      expectedUserId: auth.user.id,
    });
    return apiJson({ status: result.status, message: result.message });
  } catch (error) {
    logger.error("mobile POST /tickets/refund failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
