import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getPlaceVisitPanelCore } from "@abonten/services/places/placeVisitCore";

// GET /api/mobile/organizer/places/:placeId/visit-code
// The place's check-in QR code right now (it changes every 30 seconds --
// call again at expiresAt) and today's / this month's visits. Owner only.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the named team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "visit.show");
  if (actor.error) return apiJson(actor.error);

  try {
    const { placeId } = await params;
    return fromActionResult(
      await getPlaceVisitPanelCore(auth.supabase, actor.accountId, placeId),
    );
  } catch (error) {
    logger.error(
      "mobile GET /organizer/places/:placeId/visit-code failed",
      error,
    );
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
