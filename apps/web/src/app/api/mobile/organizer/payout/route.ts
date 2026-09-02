import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { requestOrganizerPayoutCore } from "@abonten/services/organizer/requestOrganizerPayoutCore";

// POST /api/mobile/organizer/payout { payoutAccountId, amount, currency }
// Requests a withdrawal. Ownership + available-balance checks run inside the
// request_organizer_payout RPC. Same body as requestOrganizerPayout.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  let body: {
    payoutAccountId?: unknown;
    amount?: unknown;
    currency?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return apiJson({ status: 400, message: "Invalid JSON body" });
  }

  if (
    typeof body.payoutAccountId !== "string" ||
    typeof body.amount !== "number" ||
    typeof body.currency !== "string"
  ) {
    return apiJson({
      status: 400,
      message: "payoutAccountId, amount and currency are required",
    });
  }

  try {
    const result = await requestOrganizerPayoutCore(auth.supabase, {
      payoutAccountId: body.payoutAccountId,
      amount: body.amount,
      currency: body.currency,
    });
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/payout failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
