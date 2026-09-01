import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { getUserPendingTicketCheckoutsCore } from "@/utils/getUserPendingTicketCheckoutsCore";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/checkout/pending
//
// Every active, non-expired pending checkout session for the caller, across
// all of their events — the "resume checkout" basket. Self-heals stale
// rows first, same as the web getUserPendingTicketCheckouts action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await getUserPendingTicketCheckoutsCore(
      auth.supabase,
      auth.user.id,
    );

    if (result.status === 200) {
      return apiJson({ status: 200, data: result.sessions });
    }

    return apiJson({ status: result.status, message: result.message });
  } catch (error) {
    logger.error("mobile GET /checkout/pending failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
