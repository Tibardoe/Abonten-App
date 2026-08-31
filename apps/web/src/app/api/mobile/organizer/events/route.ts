import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { fetchOrganizerEventsPage } from "@/utils/organizerReadQuery";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/events?cursor=<opaque>&pageSize=<n>
// Cursor-paginated list of the caller's own events, newest first, every
// status (drafts included — RLS `event_organizer_select`). Same query body
// as the getOrganizerEvents Server Action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await fetchOrganizerEventsPage(auth.supabase, auth.user.id, {
      cursor,
      pageSize:
        pageSize && Number.isFinite(pageSize) && pageSize > 0
          ? pageSize
          : undefined,
    });

    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/events failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
