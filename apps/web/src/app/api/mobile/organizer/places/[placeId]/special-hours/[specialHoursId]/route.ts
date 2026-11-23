import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { removePlaceSpecialHoursCore } from "@abonten/services/places/placeSpecialHoursCore";

// DELETE /api/mobile/organizer/places/:placeId/special-hours/:specialHoursId
// Removes one special date from the place's hours — same body as the web
// removePlaceSpecialHours action. 404 unless the place is the caller's and
// the date is the place's.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ placeId: string; specialHoursId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the named team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "places.manage");
  if (actor.error) return apiJson(actor.error);

  try {
    const { placeId, specialHoursId } = await params;
    const result = await removePlaceSpecialHoursCore(
      auth.supabase,
      actor.accountId,
      placeId,
      specialHoursId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile DELETE /organizer/places/:id/special-hours/:id failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
