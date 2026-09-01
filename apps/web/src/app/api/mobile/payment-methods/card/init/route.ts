import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { initCardVerificationCore } from "@/utils/cardVerificationCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/payment-methods/card/init  (no body)
//
// Starts the GHS 1 Paystack card-verification charge. Returns the
// authorizationUrl to open in a browser session + the reference to pass
// back to /card/confirm once the popup closes. Same
// initCardVerificationCore the web action runs.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  if (!auth.user.email) {
    return apiJson({ status: 401, message: "No email on this account" });
  }

  try {
    const result = await initCardVerificationCore(
      auth.user.id,
      auth.user.email,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /payment-methods/card/init failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
