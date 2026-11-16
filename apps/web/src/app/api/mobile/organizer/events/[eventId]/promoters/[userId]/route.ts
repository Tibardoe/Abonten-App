import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { removeEventPromoterCore } from "@abonten/services/rewards/promoterCommissionCore";

// DELETE /api/mobile/organizer/events/:eventId/promoters/:userId
// Takes a promoter off the event; what they already earned stays theirs.
// Answers the event's commission view.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string; userId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  const actor = await mobileActingFor(req, auth.user.id, "promotions.buy");
  if (actor.error) return apiJson(actor.error);

  try {
    const { eventId, userId } = await params;
    return fromActionResult(
      await removeEventPromoterCore(
        auth.supabase,
        actor.accountId,
        { eventId, promoterId: userId },
        auth.user.id,
      ),
    );
  } catch (error) {
    logger.error(
      "mobile DELETE /organizer/events/:eventId/promoters/:userId failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
