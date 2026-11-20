import eventRescheduleNotification from "@/actions/eventRescheduleNotification";
import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  getRescheduleSetupCore,
  rescheduleEventCore,
} from "@abonten/services/events/eventRescheduleCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { rescheduleEventSchema } from "@abonten/validation/rescheduleSchemas";
import { after } from "next/server";

// GET  /api/mobile/organizer/events/:eventId/reschedule
//   → whether the event can move, its moves so far, how many hold tickets.
// POST /api/mobile/organizer/events/:eventId/reschedule
//   { startsAt, endsAt, message }
//   → moves it, tells every holder (notice + push now, email after).
// The same cores as the web getRescheduleSetup / rescheduleEvent actions
// (docs/architecture/event-reschedule.md).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  const actor = await mobileActingFor(req, auth.user.id, "events.manage");
  if (actor.error) return apiJson(actor.error);
  try {
    const { eventId } = await params;
    return fromActionResult(
      await getRescheduleSetupCore(auth.supabase, actor.accountId, eventId),
    );
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/:eventId/reschedule failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}

export async function POST(
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
    const body = await req.json().catch(() => null);
    const parsed = rescheduleEventSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      eventId,
    });
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }
    const result = await rescheduleEventCore(
      auth.supabase,
      actor.accountId,
      auth.user.id,
      parsed.data,
    );
    if (result.status === 200) {
      const { rescheduleId } = result.data;
      after(() =>
        eventRescheduleNotification(rescheduleId).catch((error) =>
          logger.error(`Reschedule emails failed for ${rescheduleId}`, error),
        ),
      );
    }
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/events/:eventId/reschedule failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
