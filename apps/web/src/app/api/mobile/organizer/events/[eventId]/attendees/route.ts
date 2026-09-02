import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { fetchEventAttendanceListPage } from "@abonten/services/organizer/organizerReadQuery";

// GET /api/mobile/organizer/events/:eventId/attendees?cursor=<opaque>&pageSize=<n>
// Cursor-paginated attendee list for one of the caller's own events, with
// each attendee's real account email/phone merged in. Same body as
// getAttendanceList. 403 if the event isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await fetchEventAttendanceListPage(
      auth.supabase,
      auth.user.id,
      eventId,
      {
        cursor,
        pageSize:
          pageSize && Number.isFinite(pageSize) && pageSize > 0
            ? pageSize
            : undefined,
      },
    );

    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/events/:id/attendees failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
