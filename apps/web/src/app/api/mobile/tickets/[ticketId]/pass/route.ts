import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import {
  claimShowPassCore,
  getShowPassCore,
} from "@abonten/services/passes/showPassCore";
import { claimShowPassSchema } from "@abonten/validation/showPassSchemas";

// GET  /api/mobile/tickets/:ticketId/pass             the pass this ticket carries
// POST /api/mobile/tickets/:ticketId/pass  { eventId } choose a show with it
//
// Passes for several shows of a run (docs/architecture/show-passes.md).
// Same getShowPassCore / claimShowPassCore as the web actions.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { ticketId } = await params;
    return fromActionResult(await getShowPassCore(auth.user.id, ticketId));
  } catch (error) {
    logger.error("mobile GET /tickets/:ticketId/pass failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const { ticketId } = await params;
    const body = await req.json().catch(() => null);
    const parsed = claimShowPassSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      ticketId,
    });
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }
    return fromActionResult(await claimShowPassCore(auth.user.id, parsed.data));
  } catch (error) {
    logger.error("mobile POST /tickets/:ticketId/pass failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
