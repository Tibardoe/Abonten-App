import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { cancelUserTicketCore } from "@/utils/cancelUserTicketCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/tickets/cancel  { ticketId: string, transactionId?: string | null }
//
// Cancels one of the caller's tickets. If it was paid and this makes every
// ticket sharing its transaction cancelled, a partial Paystack refund of
// the ticket revenue (fee retained) is requested. Same cancelUserTicketCore
// the web action runs.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      ticketId?: unknown;
      transactionId?: unknown;
    } | null;

    if (typeof body?.ticketId !== "string" || body.ticketId.length === 0) {
      return apiJson({ status: 400, message: "ticketId is required" });
    }

    const transactionId =
      typeof body.transactionId === "string" && body.transactionId.length > 0
        ? body.transactionId
        : null;

    const result = await cancelUserTicketCore(
      auth.supabase,
      auth.user.id,
      body.ticketId,
      transactionId,
    );

    return apiJson({ status: result.status, message: result.message });
  } catch (error) {
    logger.error("mobile POST /tickets/cancel failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
