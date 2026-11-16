import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { addEventPromoterCore } from "@abonten/services/rewards/promoterCommissionCore";

// POST /api/mobile/organizer/events/:eventId/promoters
// Body: { username: string, rateBps: number | null } -- adds a promoter to
// the event (their own rate, or the event's when null), or changes the rate
// of one already on the list. Answers the event's commission view. Adding a
// member of the team that runs the event takes an Owner (X36).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  // Owners and Finance set what the team's events pay promoters.
  const actor = await mobileActingFor(req, auth.user.id, "promotions.buy");
  if (actor.error) return apiJson(actor.error);

  try {
    const { eventId } = await params;
    const body = (await req.json().catch(() => null)) as {
      username?: unknown;
      rateBps?: unknown;
    } | null;
    const rateBps =
      body?.rateBps === null || body?.rateBps === undefined
        ? null
        : typeof body.rateBps === "number"
          ? body.rateBps
          : Number.NaN;
    return fromActionResult(
      await addEventPromoterCore(
        auth.supabase,
        actor.accountId,
        {
          eventId,
          username: typeof body?.username === "string" ? body.username : "",
          rateBps,
        },
        auth.user.id,
      ),
    );
  } catch (error) {
    logger.error(
      "mobile POST /organizer/events/:eventId/promoters failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
