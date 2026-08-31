import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { validateCheckoutCore } from "@/utils/validateCheckoutCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/checkout/validate
//   { eventId: string, quantities: { [ticketTypeId]: number }, occurrenceId?: string }
//
// Reserves inventory and creates a pending checkout session — the same
// validateCheckoutCore the web action runs. Promo codes are not accepted
// from the app yet (getPromoCode / claimPromoUsage still assume the cookie
// SSR context); a request with a promoCode is rejected rather than silently
// ignored.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      eventId?: unknown;
      quantities?: unknown;
      occurrenceId?: unknown;
      promoCode?: unknown;
    } | null;

    if (typeof body?.eventId !== "string" || body.eventId.length === 0) {
      return apiJson({ status: 400, message: "eventId is required" });
    }

    if (body.promoCode != null && body.promoCode !== "") {
      return apiJson({
        status: 400,
        message: "Promo codes aren't supported in the app yet.",
      });
    }

    const rawQuantities = body.quantities;
    if (
      rawQuantities == null ||
      typeof rawQuantities !== "object" ||
      Array.isArray(rawQuantities)
    ) {
      return apiJson({ status: 400, message: "quantities is required" });
    }

    const quantities: Record<string, number> = {};
    for (const [ticketTypeId, value] of Object.entries(
      rawQuantities as Record<string, unknown>,
    )) {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        return apiJson({
          status: 400,
          message: "quantities values must be non-negative integers",
        });
      }
      quantities[ticketTypeId] = value;
    }

    const occurrenceId =
      typeof body.occurrenceId === "string" ? body.occurrenceId : null;

    const result = await validateCheckoutCore(auth.supabase, auth.user.id, {
      eventId: body.eventId,
      quantities,
      promoCode: null,
      occurrenceId,
    });

    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /checkout/validate failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
