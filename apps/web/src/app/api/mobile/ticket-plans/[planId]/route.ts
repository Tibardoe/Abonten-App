import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getTicketPlanCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { ticketPlanIdSchema } from "@abonten/validation/ticketPlanSchemas";

// GET /api/mobile/ticket-plans/:planId — one of the caller's plans.
export async function GET(
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
    const res = apiJson(
      await getTicketPlanCore(auth.user.id, parsed.data.planId),
    );
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    logger.error("mobile GET /ticket-plans/:planId failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
