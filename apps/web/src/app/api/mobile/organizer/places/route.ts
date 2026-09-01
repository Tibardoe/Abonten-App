import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { fetchOrganizerPlacesPage } from "@/utils/organizerReadQuery";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/places?cursor=<opaque>&pageSize=<n>
// Cursor-paginated list of the caller's own places, newest first (any
// status) — same body as getOrganizerPlaces' authed branch.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await fetchOrganizerPlacesPage(auth.supabase, auth.user.id, {
      cursor,
      pageSize:
        pageSize && Number.isFinite(pageSize) && pageSize > 0
          ? pageSize
          : undefined,
    });

    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/places failed", error);
    return apiJson({
      status: 500,
      message: "Something went wrong!",
      data: [],
    });
  }
}
