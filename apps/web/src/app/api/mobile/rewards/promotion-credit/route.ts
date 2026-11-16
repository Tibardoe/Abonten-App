import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getPromotionCreditCore } from "@abonten/services/rewards/promotionCreditCore";

// GET /api/mobile/rewards/promotion-credit
// The caller's promotion credit and monthly rebates (organizer finance
// screen). Same service as the getPromotionCredit Server Action.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    // Managing as a team: its credit, for the members who see its money.
    const actor = await mobileActingFor(req, auth.user.id, "money.view");
    if (actor.error) return apiJson(actor.error);
    return fromActionResult(
      await getPromotionCreditCore(auth.supabase, actor.accountId),
    );
  } catch (error) {
    logger.error("mobile GET /rewards/promotion-credit failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
