import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { addPlaceSpecialHoursCore } from "@abonten/services/places/placeSpecialHoursCore";

// POST /api/mobile/organizer/places/:placeId/special-hours
//   { date: "yyyy-mm-dd", isClosed, openTime?: "HH:MM", closeTime?: "HH:MM",
//     label? }
// Adds a special date (a holiday) to the place's hours, or replaces the one
// already set for that date — same body as the web addPlaceSpecialHours
// action. The service checks the date (today or later, within a year), the
// times and the name. 404 unless the place is the caller's.
export async function POST(
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
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body) {
      return apiJson({ status: 400, message: tr("aJsonBodyIsRequired") });
    }

    const str = (v: unknown): string | null =>
      typeof v === "string" ? v : null;

    const result = await addPlaceSpecialHoursCore(
      auth.supabase,
      actor.accountId,
      placeId,
      {
        date: str(body.date) ?? "",
        isClosed: body.isClosed === true,
        openTime: str(body.openTime),
        closeTime: str(body.closeTime),
        label: str(body.label),
      },
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/places/:id/special-hours failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
