import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { prepareCheckoutPayment } from "@abonten/services/checkout/checkoutPaymentPreparation";

// POST /api/mobile/checkout/prepare  { checkoutSessionIds: string[] }
//
// Authoritative "what do I owe right now" for a set of pending checkout
// sessions — re-reads live DB state (after self-healing expiry), never
// trusts a client-computed total. Same prepareCheckoutPayment the web
// prepareMultiCheckoutPayment action calls.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      checkoutSessionIds?: unknown;
    } | null;

    const ids = body?.checkoutSessionIds;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id) => typeof id === "string" && id.length > 0)
    ) {
      return apiJson({
        status: 400,
        message: "checkoutSessionIds must be a non-empty array of strings",
      });
    }

    const prepared = await prepareCheckoutPayment(
      auth.user.id,
      ids as string[],
      auth.supabase,
    );

    return apiJson({ status: 200, data: prepared });
  } catch (error) {
    logger.error("mobile POST /checkout/prepare failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
