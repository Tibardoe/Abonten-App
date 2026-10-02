import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { setDefaultPayoutAccountCore } from "@abonten/services/organizer/payoutAccountCore";

// POST /api/mobile/organizer/payout-accounts/default { payoutAccountId }
// Marks one payout account as the default. Same body as setDefaultPayoutAccount.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  let body: { payoutAccountId?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ status: 400, message: tr("invalidJsonBody") });
  }

  if (typeof body.payoutAccountId !== "string") {
    return apiJson({
      status: 400,
      message: tr("payoutaccountidIsRequired"),
    });
  }

  try {
    const result = await setDefaultPayoutAccountCore(
      auth.supabase,
      auth.user.id,
      body.payoutAccountId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/payout-accounts/default failed",
      error,
    );
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
