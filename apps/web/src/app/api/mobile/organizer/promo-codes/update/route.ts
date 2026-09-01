import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { updatePromoCodeCore } from "@/utils/eventPromoCodeManageCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/promo-codes/update
//   { promoCodeId, discountPercentage, maxUses: number | null,
//     expiresAt: ISO string, isActive: boolean }
// Edits the terms of an existing promo code (never its text / event) —
// same body as updatePromoCode. 403 unless the caller owns the code's event.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      promoCodeId?: unknown;
      discountPercentage?: unknown;
      maxUses?: unknown;
      expiresAt?: unknown;
      isActive?: unknown;
    } | null;

    const promoCodeId =
      typeof body?.promoCodeId === "string" && body.promoCodeId.length > 0
        ? body.promoCodeId
        : null;
    const discountPercentage = Number(body?.discountPercentage);
    const expiresAt =
      typeof body?.expiresAt === "string" && body.expiresAt.length > 0
        ? body.expiresAt
        : null;
    const isActive = body?.isActive;
    const maxUses =
      body?.maxUses === null || body?.maxUses === undefined
        ? null
        : Number(body.maxUses);

    if (
      !promoCodeId ||
      !Number.isFinite(discountPercentage) ||
      !expiresAt ||
      Number.isNaN(Date.parse(expiresAt)) ||
      typeof isActive !== "boolean" ||
      (maxUses !== null && !Number.isFinite(maxUses))
    ) {
      return apiJson({
        status: 400,
        message:
          "promoCodeId, discountPercentage, expiresAt (ISO), isActive and maxUses (number | null) are required",
      });
    }

    const result = await updatePromoCodeCore(auth.supabase, auth.user.id, {
      promoCodeId,
      discountPercentage,
      maxUses,
      expiresAt,
      isActive,
    });

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/promo-codes/update failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
