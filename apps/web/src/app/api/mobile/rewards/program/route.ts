import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getRewardsProgramCore } from "@abonten/services/rewards/rewardsProgramQuery";

// GET /api/mobile/rewards/program
// Whether Rewards is on for the caller + the active reward terms. Signed-in
// only on mobile (the app only asks once a user exists).
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    return fromActionResult(await getRewardsProgramCore(auth.supabase));
  } catch (error) {
    logger.error("mobile GET /rewards/program failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
