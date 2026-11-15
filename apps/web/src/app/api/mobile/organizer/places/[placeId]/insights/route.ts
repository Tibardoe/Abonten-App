import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { fetchPlaceInsights } from "@abonten/services/organizer/organizerReadQuery";

// GET /api/mobile/organizer/places/:placeId/insights
// Owner-only stat counts for one place (views / directions / phone /
// whatsapp / favorites / reviews) — same body as getPlaceInsights. 404 if
// the place isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the named team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "places.manage");
  if (actor.error) return apiJson(actor.error);

  try {
    const { placeId } = await params;
    const result = await fetchPlaceInsights(
      auth.supabase,
      actor.accountId,
      placeId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/places/:id/insights failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
