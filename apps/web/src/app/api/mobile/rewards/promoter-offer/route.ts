import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getEventPromoterOfferCore } from "@abonten/services/rewards/promoterCommissionCore";

// GET /api/mobile/rewards/promoter-offer?eventId=…
// What the caller earns by sharing this event (their own rate if the
// organizer added them as a promoter, else the event's), or null. Same
// service as the getEventPromoterOffer Server Action. The list of invited
// promoters is private, so the app asks here instead of reading the row.
export async function GET(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  const eventId = new URL(req.url).searchParams.get("eventId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return apiJson({ status: 400, message: tr("eventIsRequired") });
  }
  try {
    const res = await getEventPromoterOfferCore(
      auth.supabase,
      eventId,
      auth.user.id,
    );
    if (res.status !== 200) {
      return apiJson({ status: 500, message: tr("somethingWentWrong") });
    }
    return fromActionResult({ status: 200, data: res.data ?? null });
  } catch (error) {
    logger.error("mobile GET /rewards/promoter-offer failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
