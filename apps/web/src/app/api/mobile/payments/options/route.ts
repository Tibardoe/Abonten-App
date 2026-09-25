import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  type CheckoutPaymentTarget,
  getCheckoutPaymentOptionsCore,
} from "@abonten/services/payments/checkoutPaymentOptionsCore";

const PROMOTION_KINDS = new Set(["event", "place", "spotlight"]);

// GET /api/mobile/payments/options?kind=ticket&ids=<session>,<session>
// GET /api/mobile/payments/options?kind=event|place|spotlight&id=<checkoutId>
//
// The ways this buyer can pay for one order: the order's market decides the
// methods (card, bank transfer, USSD, Apple Pay…), and each saved wallet
// entry says whether it works there. Same service as the web
// getCheckoutPaymentOptions action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") ?? "";
    let target: CheckoutPaymentTarget;
    if (kind === "ticket") {
      const ids = (url.searchParams.get("ids") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      if (ids.length === 0) {
        return apiJson({ status: 400, message: "ids is required" });
      }
      target = { kind: "ticket", checkoutSessionIds: ids };
    } else if (PROMOTION_KINDS.has(kind)) {
      const id = url.searchParams.get("id");
      if (!id) return apiJson({ status: 400, message: "id is required" });
      target = {
        kind: kind as "event" | "place" | "spotlight",
        checkoutId: id,
      };
    } else {
      return apiJson({ status: 400, message: "Unknown kind" });
    }

    const platform =
      req.headers.get("x-abonten-platform") === "ios" ? "ios" : "android";
    const result = await getCheckoutPaymentOptionsCore(
      auth.supabase,
      auth.user.id,
      target,
      platform,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /payments/options failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
