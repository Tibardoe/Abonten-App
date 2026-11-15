import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import {
  getEventTicketTransferSettingCore,
  setEventTicketTransferSettingCore,
} from "@abonten/services/ticketTransfers/ticketTransferCore";
import { eventTicketTransferSettingSchema } from "@abonten/validation/ticketTransferSchemas";

// GET /api/mobile/organizer/events/:eventId/ticket-transfers
// The organizer's switch: may guests send this event's tickets on (on
// unless switched off), and whether the programme is open to them.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { eventId } = await params;
    return apiJson(
      await getEventTicketTransferSettingCore(
        getSupabaseServiceClient(),
        auth.user.id,
        eventId,
      ),
    );
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/:eventId/ticket-transfers failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}

// PUT /api/mobile/organizer/events/:eventId/ticket-transfers
// Body: { enabled: boolean }. Off stops new offers; open ones can still be
// answered, so no ticket is left between two people.
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
    const parsed = eventTicketTransferSettingSchema.safeParse({
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
      await setEventTicketTransferSettingCore(
        getSupabaseServiceClient(),
        auth.user.id,
        parsed.data.eventId,
        parsed.data.enabled,
      ),
    );
  } catch (error) {
    logger.error(
      "mobile PUT /organizer/events/:eventId/ticket-transfers failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
