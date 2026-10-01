import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import {
  addPayoutAccountCore,
  listPayoutAccountsCore,
} from "@abonten/services/organizer/payoutAccountCore";

// GET  /api/mobile/organizer/payout-accounts   -> active payout destinations
// POST /api/mobile/organizer/payout-accounts   -> add one (momo or bank);
//   body is validated by addPayoutAccountSchema inside the core.
// Same bodies as getOrganizerPayoutAccounts / addPayoutAccount.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await listPayoutAccountsCore(auth.supabase, auth.user.id);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/payout-accounts failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}

export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiJson({ status: 400, message: tr("invalidJsonBody") });
  }

  try {
    const result = await addPayoutAccountCore(
      auth.supabase,
      auth.user.id,
      body,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/payout-accounts failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
