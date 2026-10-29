import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import {
  createPromoCodeCore,
  fetchEventPromoCodes,
} from "@abonten/services/promo-codes/eventPromoCodeManageCore";

// GET /api/mobile/organizer/events/:eventId/promo-codes
// The caller's own event's promo codes, newest first, with usage counts —
// same body as getEventPromoCodes. 403 if the event isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    const result = await fetchEventPromoCodes(
      auth.supabase,
      auth.user.id,
      eventId,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/events/:id/promo-codes failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
      data: [],
    });
  }
}

// POST /api/mobile/organizer/events/:eventId/promo-codes
//   { promoCode, discountPercentage, maxUses: number | null, expiresAt: ISO }
// Adds a code to the caller's own existing event — same body as the web
// createPromoCode action. 403 if the event isn't the caller's, 409 when it
// already has that code, 400 on a free event.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    const body = (await req.json().catch(() => null)) as {
      promoCode?: unknown;
      discountPercentage?: unknown;
      maxUses?: unknown;
      expiresAt?: unknown;
    } | null;

    const promoCode =
      typeof body?.promoCode === "string" ? body.promoCode : null;
    const discountPercentage = Number(body?.discountPercentage);
    const expiresAt =
      typeof body?.expiresAt === "string" && body.expiresAt.length > 0
        ? body.expiresAt
        : null;
    const maxUses =
      body?.maxUses === null || body?.maxUses === undefined
        ? null
        : Number(body.maxUses);

    if (
      promoCode === null ||
      !Number.isFinite(discountPercentage) ||
      !expiresAt ||
      Number.isNaN(Date.parse(expiresAt)) ||
      (maxUses !== null && !Number.isFinite(maxUses))
    ) {
      return apiJson({
        status: 400,
        message: tr("promocodeDiscountpercentageExpiresatMaxusesAreReq"),
      });
    }

    const result = await createPromoCodeCore(auth.supabase, auth.user.id, {
      eventId,
      promoCode,
      discountPercentage,
      maxUses,
      expiresAt,
    });
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/events/:id/promo-codes failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
