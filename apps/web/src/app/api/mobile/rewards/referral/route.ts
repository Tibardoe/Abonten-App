import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getReferralLinkCore } from "@abonten/services/rewards/referralCore";

// GET /api/mobile/rewards/referral
// The caller's referral code for share links (created on first use), or
// { captureEnabled: false, code: null } while referral capture is off.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    return fromActionResult(await getReferralLinkCore(auth.user.id));
  } catch (error) {
    logger.error("mobile GET /rewards/referral failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
