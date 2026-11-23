import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { heldTicketPaidAmountsCore } from "@abonten/services/tickets/heldTicketPaidAmountsCore";

// GET /api/mobile/tickets/:ticketId/paid-amount
//
// The amount the buyer chose for a ticket the caller holds (open-amount
// tickets, docs/architecture/open-amount-tickets.md). A ticket someone sent
// the caller was bought on the sender's checkout line, which the caller's
// own session cannot read; the service reads it for the person who holds
// the ticket now. Same heldTicketPaidAmountsCore the website's ticket lists
// use (getUserAttendingEvents, getTicketsByIds). `paidAmount` is null for a
// fixed-price ticket or one the caller does not hold.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { ticketId } = await params;
    const result = await heldTicketPaidAmountsCore(auth.user.id, [ticketId]);
    if (result.status !== 200) return apiJson(result);
    return apiJson({
      status: 200,
      data: { paidAmount: result.data[ticketId] ?? null },
    });
  } catch (error) {
    logger.error("mobile GET /tickets/:ticketId/paid-amount failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
