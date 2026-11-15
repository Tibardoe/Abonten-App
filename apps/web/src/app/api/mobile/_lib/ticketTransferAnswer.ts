import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import {
  acceptTicketTransferCore,
  cancelTicketTransferCore,
  declineTicketTransferCore,
} from "@abonten/services/ticketTransfers/ticketTransferCore";
import { ticketTransferIdSchema } from "@abonten/validation/ticketTransferSchemas";

const CORES = {
  accept: acceptTicketTransferCore,
  decline: declineTicketTransferCore,
  cancel: cancelTicketTransferCore,
} as const;

/**
 * POST /api/mobile/ticket-transfers/:transferId/{accept|decline|cancel}:
 * the receiver answers an offer, or the sender takes it back. The same
 * cores the web actions run.
 */
export function ticketTransferAnswerRoute(action: keyof typeof CORES) {
  return async function POST(
    req: Request,
    { params }: { params: Promise<{ transferId: string }> },
  ) {
    bindLocaleFromRequest(req);
    const auth = await getMobileAuth(req);
    if (auth.response) return auth.response;
    try {
      const parsed = ticketTransferIdSchema.safeParse(await params);
      if (!parsed.success) {
        return apiJson({ status: 404, message: tr("ticketTransferNotFound") });
      }
      const result: { status: number; message?: string; data?: unknown } =
        await CORES[action](
          getSupabaseServiceClient(),
          auth.user.id,
          parsed.data.transferId,
        );
      return apiJson(result);
    } catch (error) {
      logger.error(`mobile POST /ticket-transfers/:id/${action} failed`, error);
      return apiJson({ status: 500, message: tr("somethingWentWrong") });
    }
  };
}
