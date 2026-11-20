import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { addEventShowsCore } from "@abonten/services/events/eventShowsCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { addEventShowsSchema } from "@abonten/validation/showRunSchemas";

// POST /api/mobile/organizer/events/:eventId/shows
//   { rule?: { fromDate, untilDate, slots: { weekday, time }[], durationMinutes },
//     shows?: { startsAt, endsAt }[], separate?: boolean,
//     venue?: { placeId } | { address, latitude, longitude }, clientRequestId }
//
// Adds shows to the listing's run, or makes a separate copy with one date,
// at the listing's venue or another one in the same country (a tour).
// Runs the same addEventShowsCore as the web addEventShows action
// (docs/architecture/show-runs.md).
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
    const parsed = addEventShowsSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      eventId,
    });
    if (!parsed.success) {
      return apiJson({ status: 400, message: tr("invalidRequestBody") });
    }
    const result = await addEventShowsCore(auth.supabase, actor.accountId, {
      eventId: parsed.data.eventId,
      rule: parsed.data.rule
        ? {
            ...parsed.data.rule,
            slots: parsed.data.rule.slots.map((s) => ({
              weekday: s.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
              time: s.time,
            })),
          }
        : null,
      shows: parsed.data.shows ?? null,
      separate: parsed.data.separate,
      venue: parsed.data.venue ?? null,
      clientRequestId: parsed.data.clientRequestId,
    });
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/events/:eventId/shows failed", error);
    return apiJson({ status: 500, message: tr("somethingWentWrong") });
  }
}
