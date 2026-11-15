import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { fetchOrganizerFinanceOverview } from "@abonten/services/organizer/organizerReadQuery";

// GET /api/mobile/organizer/finance
// The organizer's balance figures per currency (pending / available /
// total). Same body as the getOrganizerFinanceOverview action.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "money.view");
  if (actor.error) return apiJson(actor.error);

  try {
    const result = await fetchOrganizerFinanceOverview(
      auth.supabase,
      actor.accountId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/finance failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
