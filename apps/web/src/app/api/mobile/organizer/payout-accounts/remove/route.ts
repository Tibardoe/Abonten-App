import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { bearerFrom } from "@/app/api/mobile/_lib/authedClient";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { removePayoutAccountCore } from "@abonten/services/organizer/payoutAccountCore";
import { signedInAt } from "@abonten/services/teams/teamMoney";

// POST /api/mobile/organizer/payout-accounts/remove { payoutAccountId }
// Soft-removes a payout account. Same body as removePayoutAccount.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "payout.manage");
  if (actor.error) return apiJson(actor.error);

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
    const result = await removePayoutAccountCore(
      auth.supabase,
      actor.accountId,
      body.payoutAccountId,
      actor.role
        ? {
            personId: auth.user.id,
            accountId: actor.accountId,
            role: actor.role,
            signedInAt: await signedInAt(
              auth.supabase,
              bearerFrom(req) ?? undefined,
            ),
          }
        : null,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/payout-accounts/remove failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
