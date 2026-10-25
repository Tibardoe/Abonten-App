import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import {
  getEventTicketPlanSettingCore,
  setEventTicketPlanSettingCore,
} from "@abonten/services/ticketPlans/eventTicketPlanCore";
import { eventTicketPlanSettingSchema } from "@abonten/validation/ticketPlanSchemas";

// GET /api/mobile/organizer/events/:eventId/ticket-plans
// The organizer's Pay small small switch for this event, and what plans
// hold on it. 404 when the event is not the caller's.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { eventId } = await params;
    return apiJson(await getEventTicketPlanSettingCore(auth.user.id, eventId));
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/:eventId/ticket-plans failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}

// PUT /api/mobile/organizer/events/:eventId/ticket-plans
// Body: { enabled: boolean }. Off stops new plans; running ones continue.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { eventId } = await params;
    const body = (await req.json().catch(() => null)) as {
      enabled?: unknown;
    } | null;
    const parsed = eventTicketPlanSettingSchema.safeParse({
      eventId,
      enabled: body?.enabled,
    });
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidInput"),
      });
    }
    return apiJson(
      await setEventTicketPlanSettingCore(auth.user.id, parsed.data),
    );
  } catch (error) {
    logger.error(
      "mobile PUT /organizer/events/:eventId/ticket-plans failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
