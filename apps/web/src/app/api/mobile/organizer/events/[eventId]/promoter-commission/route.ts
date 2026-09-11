import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  getEventPromoterCommissionCore,
  setEventPromoterCommissionCore,
} from "@abonten/services/rewards/promoterCommissionCore";

// GET /api/mobile/organizer/events/:eventId/promoter-commission
// The commission the organizer offers promoters on this event, and how
// promoters' sales are going. 403 if the event isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    return fromActionResult(
      await getEventPromoterCommissionCore(
        auth.supabase,
        auth.user.id,
        eventId,
      ),
    );
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/:eventId/promoter-commission failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

// PUT /api/mobile/organizer/events/:eventId/promoter-commission
// Body: { rateBps: number | null } -- null stops the offer.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    const body = (await req.json().catch(() => null)) as {
      rateBps?: unknown;
    } | null;
    const rateBps =
      body?.rateBps === null
        ? null
        : typeof body?.rateBps === "number"
          ? body.rateBps
          : Number.NaN;
    return fromActionResult(
      await setEventPromoterCommissionCore(auth.supabase, auth.user.id, {
        eventId,
        rateBps,
      }),
    );
  } catch (error) {
    logger.error(
      "mobile PUT /organizer/events/:eventId/promoter-commission failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
