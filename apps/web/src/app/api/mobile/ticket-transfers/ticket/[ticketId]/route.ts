import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { getTicketTransferStateCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { ticketIdSchema } from "@abonten/validation/ticketTransferSchemas";

// GET /api/mobile/ticket-transfers/ticket/:ticketId
// Whether the caller's ticket can be sent, and the offer waiting on it.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const parsed = ticketIdSchema.safeParse(await params);
    if (!parsed.success) {
      return apiJson({ status: 404, message: tr("ticketNotFound") });
    }
    const res = apiJson(
      await getTicketTransferStateCore(
        getSupabaseServiceClient(),
        auth.user.id,
        parsed.data.ticketId,
      ),
    );
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    logger.error("mobile GET /ticket-transfers/ticket/:ticketId failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
