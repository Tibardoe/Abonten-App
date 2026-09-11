import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getLoyaltyProgressCore } from "@abonten/services/rewards/loyaltyCore";

// GET /api/mobile/rewards/loyalty
// The caller's count towards the next loyalty fee rebate (null data while
// the reward isn't live). Same service as the getLoyaltyProgress action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    return fromActionResult(await getLoyaltyProgressCore(auth.user.id));
  } catch (error) {
    logger.error("mobile GET /rewards/loyalty failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
