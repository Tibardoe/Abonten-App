import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { validateCheckoutCore } from "@abonten/services/checkout/validateCheckoutCore";

// POST /api/mobile/checkout/validate
//   { eventId: string, quantities: { [ticketTypeId]: number },
//     occurrenceId?: string, promoCode?: string }
//
// Reserves inventory and creates a pending checkout session — the same
// validateCheckoutCore the web action runs. Promo codes are honoured: the
// core threads this route's Bearer client through getPromoCodeCore /
// claimPromoUsage so the promo_code / promo_code_usage writes run as the
// caller's own `authenticated` role + `auth.uid()`.
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

    const promoCode =
      typeof body.promoCode === "string" && body.promoCode.trim().length > 0
        ? body.promoCode.trim()
        : null;

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
      promoCode,
      occurrenceId,
    });

    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /checkout/validate failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
