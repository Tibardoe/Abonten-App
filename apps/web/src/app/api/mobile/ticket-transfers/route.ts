import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { canTextNumber } from "@abonten/services/safety/safetyPeople";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import {
  getTicketTransferProgramCore,
  listIncomingTicketTransfersCore,
  listOutgoingTicketTransfersCore,
  sendTicketCore,
} from "@abonten/services/ticketTransfers/ticketTransferCore";
import { sendTicketSchema } from "@abonten/validation/ticketTransferSchemas";

// GET /api/mobile/ticket-transfers
// The person's offers: tickets sent to them (to accept or decline), the
// ones they sent that are still waiting, and whether they may send.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const svc = getSupabaseServiceClient();
    const [incoming, outgoing, program] = await Promise.all([
      listIncomingTicketTransfersCore(svc, auth.user.id),
      listOutgoingTicketTransfersCore(svc, auth.user.id),
      getTicketTransferProgramCore(svc, auth.user.id),
    ]);
    if (incoming.status !== 200) return apiJson(incoming);
    if (outgoing.status !== 200) return apiJson(outgoing);
    const res = apiJson({
      status: 200,
      data: {
        incoming: incoming.data,
        outgoing: outgoing.data,
        program: program.data,
      },
    });
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    logger.error("mobile GET /ticket-transfers failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}

// POST /api/mobile/ticket-transfers
//   { ticketId, target: { kind: "username", username } | { kind: "phone", phone } }
// Offers the ticket; it moves only when the receiver accepts.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const parsed = sendTicketSchema.safeParse(
      (await req.json().catch(() => null)) ?? {},
    );
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidInput"),
      });
    }
    return apiJson(
      await sendTicketCore(
        getSupabaseServiceClient(),
        auth.user.id,
        parsed.data,
        {
          canTextNumber,
        },
      ),
    );
  } catch (error) {
    logger.error("mobile POST /ticket-transfers failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
