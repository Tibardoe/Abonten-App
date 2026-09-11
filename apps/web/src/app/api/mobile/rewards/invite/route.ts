import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getReferralInviteCore } from "@abonten/services/rewards/inviteCore";

// GET /api/mobile/rewards/invite
// The caller's friend-invite link (code created on first use while invites
// are live), the offer, their invite stats and who invited them.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    return fromActionResult(await getReferralInviteCore(auth.user.id));
  } catch (error) {
    logger.error("mobile GET /rewards/invite failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
