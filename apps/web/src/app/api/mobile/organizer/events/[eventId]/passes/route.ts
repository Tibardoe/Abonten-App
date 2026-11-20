import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { addShowPassCore } from "@abonten/services/passes/showPassCore";
import { addShowPassSchema } from "@abonten/validation/showPassSchemas";

// POST /api/mobile/organizer/events/:eventId/passes
//   { name, shows, price, quantity | null }
//
// Sells a pass on every show of the event's run still to come. Runs the
// same addShowPassCore as the web action (docs/architecture/show-passes.md).
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
    const parsed = addShowPassSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      eventId,
    });
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }
    const result = await addShowPassCore(
      auth.supabase,
      actor.accountId,
      parsed.data,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/events/:eventId/passes failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
