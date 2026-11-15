import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { findTicketTransferRecipientCore } from "@abonten/services/ticketTransfers/ticketTransferCore";
import { ticketTransferRecipientSchema } from "@abonten/validation/ticketTransferSchemas";

// POST /api/mobile/ticket-transfers/recipient
//   { target: { kind: "username", username } | { kind: "phone", phone } }
// Who the ticket would go to, shown before sending. A number is only
// checked and masked, never said to belong to an account.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const parsed = ticketTransferRecipientSchema.safeParse(
      (await req.json().catch(() => null)) ?? {},
    );
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidInput"),
      });
    }
    return apiJson(
      await findTicketTransferRecipientCore(
        getSupabaseServiceClient(),
        auth.user.id,
        parsed.data.target,
      ),
    );
  } catch (error) {
    logger.error("mobile POST /ticket-transfers/recipient failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
