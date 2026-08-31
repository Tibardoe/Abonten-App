import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { fetchOrganizerFinanceOverview } from "@/utils/organizerReadQuery";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/finance
// The organizer's balance figures per currency (pending / available /
// total). Same body as the getOrganizerFinanceOverview action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await fetchOrganizerFinanceOverview(auth.supabase);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/finance failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
