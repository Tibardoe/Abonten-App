import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getCreditActivityCore } from "@abonten/services/rewards/creditsQuery";

// GET /api/mobile/rewards/activity?cursor=<opaque>&pageSize=<n>
// The caller's credit activity, newest first. Same service as the
// getCreditActivity Server Action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await getCreditActivityCore(auth.supabase, auth.user.id, {
      cursor,
      pageSize:
        pageSize && Number.isFinite(pageSize) && pageSize > 0
          ? pageSize
          : undefined,
    });

    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /rewards/activity failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
