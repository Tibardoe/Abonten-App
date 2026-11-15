import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getEventForEditCore } from "@abonten/services/events/getEventForEditCore";
import { getEventHasConfirmedParticipationCore } from "@abonten/services/events/getEventHasConfirmedParticipationCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";

// GET /api/mobile/organizer/events/:eventId/edit
// The owner-scoped event row for prefilling the native edit form, plus
// `hasConfirmedParticipation` (whether dates / location / capacity are
// locked). 404 if the event isn't the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the named team, if the person's role covers this.
  const actor = await mobileActingFor(req, auth.user.id, "events.manage");
  if (actor.error) return apiJson(actor.error);

  try {
    const { eventId } = await params;
    if (!eventId) {
      return apiJson({ status: 400, message: tr("missingEventId") });
    }

    const [event, participation] = await Promise.all([
      getEventForEditCore(auth.supabase, actor.accountId, eventId),
      getEventHasConfirmedParticipationCore(
        auth.supabase,
        actor.accountId,
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
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
