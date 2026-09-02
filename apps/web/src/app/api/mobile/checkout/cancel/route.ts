import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { cancelTicketCheckoutSessionCore } from "@abonten/services/checkout/cancelTicketCheckoutSessionCore";

// POST /api/mobile/checkout/cancel  { checkoutSessionId: string }
//
// Cancels a whole pending checkout session and releases its reservations —
// same cancelTicketCheckoutSessionCore the web action runs.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      checkoutSessionId?: unknown;
    } | null;

    if (
      typeof body?.checkoutSessionId !== "string" ||
      body.checkoutSessionId.length === 0
    ) {
      return apiJson({ status: 400, message: "checkoutSessionId is required" });
    }

    const result = await cancelTicketCheckoutSessionCore(
      auth.supabase,
      auth.user.id,
      body.checkoutSessionId,
    );

    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /checkout/cancel failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
