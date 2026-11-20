import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { giveComplimentaryTicketsCore } from "@abonten/services/comps/complimentaryCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { giveComplimentaryTicketsSchema } from "@abonten/validation/complimentarySchemas";

// POST /api/mobile/organizer/events/:eventId/complimentary
//   { ticketTypeId, quantity, occurrenceId?, target: { kind, username|phone }, note? }
//
// Gives free tickets of one of the event's types to a named person. Runs
// the same giveComplimentaryTicketsCore as the web action
// (docs/architecture/complimentary-tickets.md).
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
    const parsed = giveComplimentaryTicketsSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      eventId,
    });
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }
    const result = await giveComplimentaryTicketsCore(
      auth.supabase,
      actor.accountId,
      auth.user.id,
      parsed.data,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/events/:eventId/complimentary failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
