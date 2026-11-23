import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { updateTicketTypeNotesCore } from "@abonten/services/events/updateTicketTypeNotesCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";

// PUT /api/mobile/organizer/events/:eventId/ticket-types/notes
//   { notes: { ticketTypeId, description: string | null }[] }
// What each ticket type includes, changed on its own — allowed before and
// after the first sale (it changes no money). Runs the same
// updateTicketTypeNotesCore the web updateTicketTypeNotes action runs.
export async function PUT(
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
    const body = (await req.json().catch(() => null)) as {
      notes?: unknown;
    } | null;

    if (!eventId || !body || !Array.isArray(body.notes)) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }

    const notes = (body.notes as Record<string, unknown>[])
      .filter((n) => n && typeof n.ticketTypeId === "string")
      .map((n) => ({
        ticketTypeId: n.ticketTypeId as string,
        description: typeof n.description === "string" ? n.description : null,
      }));

    const result = await updateTicketTypeNotesCore(
      auth.supabase,
      actor.accountId,
      { eventId, notes },
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile PUT /organizer/events/:eventId/ticket-types/notes failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
