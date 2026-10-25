import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getBalanceCore } from "@abonten/services/ticketPlans/ticketPlanCore";

// GET /api/mobile/ticket-plans/balance
// The Balance screen in one call: money put towards tickets on open plans,
// the plans, and Abonten Credit for people who can see Rewards.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const res = apiJson(await getBalanceCore(auth.supabase, auth.user.id));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    logger.error("mobile GET /ticket-plans/balance failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
