import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getEventForEditCore } from "@abonten/services/events/getEventForEditCore";
import { getEventHasConfirmedParticipationCore } from "@abonten/services/events/getEventHasConfirmedParticipationCore";

// GET /api/mobile/organizer/events/:eventId/edit
// The owner-scoped event row for prefilling the native edit form, plus
// `hasConfirmedParticipation` (whether dates / location / capacity are
// locked). 404 if the event isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { eventId } = await params;
    if (!eventId) {
      return apiJson({ status: 400, message: "Missing event id" });
    }

    const [event, participation] = await Promise.all([
      getEventForEditCore(auth.supabase, auth.user.id, eventId),
      getEventHasConfirmedParticipationCore(
        auth.supabase,
        auth.user.id,
        eventId,
      ),
    ]);

    if (event.status !== 200) {
      return apiJson({ status: event.status, message: event.message });
    }

    return apiJson({
      status: 200,
      data: {
        event: event.data,
        hasConfirmedParticipation:
          participation.status === 200 ? participation.data : false,
      },
    });
  } catch (error) {
    logger.error("mobile GET /organizer/events/:eventId/edit failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
