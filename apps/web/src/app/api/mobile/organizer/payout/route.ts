import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { requestOrganizerPayoutCore } from "@abonten/services/organizer/requestOrganizerPayoutCore";

// POST /api/mobile/organizer/payout { payoutAccountId, amount, currency }
// Requests a withdrawal. Ownership + available-balance checks run inside the
// request_organizer_payout RPC. Same body as requestOrganizerPayout.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "payout.request");
  if (actor.error) return apiJson(actor.error);

  let body: {
    payoutAccountId?: unknown;
    amount?: unknown;
    currency?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return apiJson({ status: 400, message: tr("invalidJsonBody") });
  }

  if (
    typeof body.payoutAccountId !== "string" ||
    typeof body.amount !== "number" ||
    typeof body.currency !== "string"
  ) {
    return apiJson({
      status: 400,
      message: tr("payoutaccountidAmountAndCurrencyAreRequired"),
    });
  }

  try {
    const result = await requestOrganizerPayoutCore(
      auth.supabase,
      {
        payoutAccountId: body.payoutAccountId,
        amount: body.amount,
        currency: body.currency,
      },
      actor.role
        ? {
            personId: auth.user.id,
            accountId: actor.accountId,
            role: actor.role,
          }
        : null,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/payout failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
