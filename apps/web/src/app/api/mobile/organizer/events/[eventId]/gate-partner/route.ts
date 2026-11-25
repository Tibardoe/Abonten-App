import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  confirmGatePartnerVoidsCore,
  getEventGatePartnerCore,
} from "@abonten/services/gatePartners/organizerGateCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { confirmGatePartnerVoidsSchema } from "@abonten/validation/gatePartnerSchemas";

// GET /api/mobile/organizer/events/:eventId/gate-partner
// The event's gate partner link, read-only (staff set it up): the partner
// whose check-in system admits its tickets, the ticket types it maps, and
// the codes to void there (docs/architecture/gate-partner-connectors.md).
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
    return apiJson(
      await getEventGatePartnerCore(
        getSupabaseServiceClient(),
        actor.accountId,
        eventId,
      ),
    );
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/:eventId/gate-partner failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}

// POST /api/mobile/organizer/events/:eventId/gate-partner
// Body: { ticketIds: string[] }. The organizer voided these partner codes
// in their own gate system.
export async function POST(
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
    const body = (await req.json().catch(() => null)) as {
      ticketIds?: unknown;
    } | null;
    const parsed = confirmGatePartnerVoidsSchema.safeParse({
      eventId,
      ticketIds: body?.ticketIds,
    });
    if (!parsed.success) {
      return apiJson({
        status: 400,
        message: parsed.error.issues[0]?.message ?? tr("invalidInput"),
      });
    }
    return apiJson(
      await confirmGatePartnerVoidsCore(
        getSupabaseServiceClient(),
        actor.accountId,
        auth.user.id,
        parsed.data,
      ),
    );
  } catch (error) {
    logger.error(
      "mobile POST /organizer/events/:eventId/gate-partner failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
