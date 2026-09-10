import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getCreditSummaryCore } from "@abonten/services/rewards/creditsQuery";

// GET /api/mobile/rewards/summary
// The caller's Abonten Credit balance + whether Rewards is on for them.
// Same service as the getCreditSummary Server Action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    return fromActionResult(
      await getCreditSummaryCore(auth.supabase, auth.user.id),
    );
  } catch (error) {
    logger.error("mobile GET /rewards/summary failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
