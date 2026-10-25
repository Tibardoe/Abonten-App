import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { cancelTicketPlanCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { ticketPlanIdSchema } from "@abonten/validation/ticketPlanSchemas";

// POST /api/mobile/ticket-plans/:planId/cancel
// Ends the caller's own unfinished plan: the seats go back on sale and
// what was paid comes back per the plan's terms.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const parsed = ticketPlanIdSchema.safeParse(await params);
    if (!parsed.success) {
      return apiJson({ status: 404, message: tr("thisPlanWasNotFound") });
    }
    return apiJson(
      await cancelTicketPlanCore(auth.user.id, parsed.data.planId),
    );
  } catch (error) {
    logger.error("mobile POST /ticket-plans/:planId/cancel failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
