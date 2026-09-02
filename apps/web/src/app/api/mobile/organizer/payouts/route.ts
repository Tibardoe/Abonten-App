import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { listPayoutsCore } from "@abonten/services/organizer/payoutAccountCore";

// GET /api/mobile/organizer/payouts?offset=<n>&limit=<n>
// The organizer's withdrawal history, newest first. Same body as
// getOrganizerPayouts (simple offset pagination).
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const offsetRaw = Number(searchParams.get("offset"));
    const limitRaw = Number(searchParams.get("limit"));
    const offset =
      Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50
        ? Math.floor(limitRaw)
        : 20;

    const result = await listPayoutsCore(
      auth.supabase,
      auth.user.id,
      offset,
      limit,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile GET /organizer/payouts failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
