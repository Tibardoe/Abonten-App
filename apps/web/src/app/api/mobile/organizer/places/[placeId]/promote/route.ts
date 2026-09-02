import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { insertPlacePromotionCheckoutCore } from "@/utils/placePromotionCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/places/:placeId/promote  { tierId: number }
// Reserve step: creates a pending place_promotion_checkout priced from the
// seeded tier (never the client) and returns its id + amount for the
// payment screen. 403 if the place isn't the caller's.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    if (!placeId) {
      return apiJson({ status: 400, message: "Missing place id" });
    }

    const body = (await req.json().catch(() => null)) as {
      tierId?: unknown;
    } | null;

    const tierId =
      typeof body?.tierId === "number" && Number.isFinite(body.tierId)
        ? body.tierId
        : null;
    if (tierId === null) {
      return apiJson({ status: 400, message: "tierId is required" });
    }

    const result = await insertPlacePromotionCheckoutCore(
      auth.supabase,
      auth.user.id,
      placeId,
      tierId,
    );

    if (result.status !== 200) {
      return apiJson({ status: result.status, message: result.message });
    }

    return apiJson({
      status: 200,
      data: {
        checkoutId: result.checkoutId,
        tierLabel: result.tierLabel,
        amount: result.amount,
        currency: result.currency,
      },
    });
  } catch (error) {
    logger.error(
      "mobile POST /organizer/places/:placeId/promote failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
