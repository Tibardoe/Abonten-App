import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { deletePromoCodeCore } from "@abonten/services/promo-codes/eventPromoCodeManageCore";

// POST /api/mobile/organizer/promo-codes/delete  { promoCodeId }
// Deletes a never-used promo code; deactivates one that's already been
// redeemed (usage history is preserved) — same body as deletePromoCode.
// 403 unless the caller owns the code's event.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      promoCodeId?: unknown;
    } | null;

    const promoCodeId =
      typeof body?.promoCodeId === "string" && body.promoCodeId.length > 0
        ? body.promoCodeId
        : null;

    if (!promoCodeId) {
      return apiJson({ status: 400, message: "promoCodeId is required" });
    }

    const result = await deletePromoCodeCore(
      auth.supabase,
      auth.user.id,
      promoCodeId,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/promo-codes/delete failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
