import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  joinEventRunsCore,
  listJoinableRunsCore,
} from "@abonten/services/events/eventShowsCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import {
  joinEventRunsSchema,
  joinableRunsSchema,
} from "@abonten/validation/showRunSchemas";

// Bringing another run into this listing's run (docs/architecture/
// show-runs.md §2b). Same services as the website's getJoinableRuns and
// joinEventRuns actions.

// GET /api/mobile/organizer/events/:eventId/shows/join
//   -> { eventId, title, showCount, firstStartsAt, lastStartsAt, timezone }[]
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
    const parsed = joinableRunsSchema.safeParse(await params);
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }
    const result = await listJoinableRunsCore(
      auth.supabase,
      actor.accountId,
      parsed.data.eventId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/:eventId/shows/join failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}

// POST /api/mobile/organizer/events/:eventId/shows/join   { otherEventId }
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
    const body = await req.json().catch(() => null);
    const parsed = joinEventRunsSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      eventId,
    });
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }
    const result = await joinEventRunsCore(actor.accountId, parsed.data);
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile POST /organizer/events/:eventId/shows/join failed",
      error,
    );
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
