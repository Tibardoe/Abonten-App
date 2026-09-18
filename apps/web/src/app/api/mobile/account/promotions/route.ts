import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { listActivePromotionsCore } from "@abonten/services/promotions/activePromotionsCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";

// GET /api/mobile/account/promotions
// The caller's live and queued promotions (featured events and places,
// promoted Spotlights) for Settings › Overview. Same service as the web
// getUserActivePromotions action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await listActivePromotionsCore(
      getSupabaseServiceClient(),
      auth.user.id,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /account/promotions failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
