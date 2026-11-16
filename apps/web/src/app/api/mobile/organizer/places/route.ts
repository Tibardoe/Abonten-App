import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { fetchOrganizerPlacesPage } from "@abonten/services/organizer/organizerReadQuery";

// GET /api/mobile/organizer/places?cursor=<opaque>&pageSize=<n>
// Cursor-paginated list of the caller's own places, newest first (any
// status) — same body as getOrganizerPlaces' authed branch.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the named team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, [
    "places.manage",
    "bookings.manage",
    "visit.show",
    "reviews.reply",
    "promotions.buy",
  ]);
  if (actor.error) return apiJson(actor.error);

  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await fetchOrganizerPlacesPage(
      auth.supabase,
      actor.accountId,
      {
        cursor,
        pageSize:
          pageSize && Number.isFinite(pageSize) && pageSize > 0
            ? pageSize
            : undefined,
        // A member limited to some places sees only those (or the events
        // held at them).
        placeIds: actor.placeIds,
      },
    );

    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/places failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
      data: [],
    });
  }
}
