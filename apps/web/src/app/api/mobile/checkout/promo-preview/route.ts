import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getPromoCodeCore } from "@abonten/services/promo-codes/getPromoCodeCore";

// POST /api/mobile/checkout/promo-preview
//   { eventId: string, code: string }
//
// Read-only promo-code check for the Buy Tickets screen — the mobile
// equivalent of the web `getPromoCode` action. Returns the discount % + how
// many uses are left so the client can preview the saving. Does NOT claim
// the code — that still happens server-side in validateCheckoutCore when the
// user proceeds (`/api/mobile/checkout/validate`).
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      eventId?: unknown;
      code?: unknown;
    } | null;

    if (typeof body?.eventId !== "string" || body.eventId.length === 0) {
      return apiJson({ status: 400, message: "eventId is required" });
    }
    if (typeof body?.code !== "string" || body.code.trim().length === 0) {
      return apiJson({ status: 400, message: "Enter a promo code" });
    }

    const result = await getPromoCodeCore(
      auth.supabase,
      auth.user.id,
      body.code,
      body.eventId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /checkout/promo-preview failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
