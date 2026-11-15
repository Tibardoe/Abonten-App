import eventCancellationNotification from "@/actions/eventCancellationNotification";
import { mobileActingFor } from "@/app/api/mobile/_lib/actor";
import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { cancelEventCore } from "@abonten/services/events/cancelEventCore";
import {
  bindLocaleFromRequest,
  tr,
} from "@abonten/services/i18n/requestLocale";
import { after } from "next/server";

// POST /api/mobile/organizer/events/cancel { eventId }
// Cancels an event, releases every ticket, starts attendee refunds and
// queues the notification emails — the full cancelEvent path. Ownership +
// idempotency are enforced by the cancel_event_and_release_tickets RPC.
export async function POST(req: Request) {
  bindLocaleFromRequest(req);
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  // Managing as a team: the chosen team, if the person's role covers this.
  const actor = await mobileActingFor(
    req,
    auth.user.id,
    ["events.manage", "refunds.issue"],
    { all: true },
  );
  if (actor.error) return apiJson(actor.error);

  let body: { eventId?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ status: 400, message: tr("invalidJsonBody") });
  }

  if (typeof body.eventId !== "string") {
    return apiJson({ status: 400, message: tr("eventidIsRequired") });
  }

  try {
    const result = await cancelEventCore(
      auth.supabase,
      body.eventId,
      (eventTitle, attendees) =>
        after(() =>
          eventCancellationNotification(eventTitle, attendees).catch((error) =>
            logger.error(`Failed sending event cancellation emails: ${error}`),
          ),
        ),
      actor.role
        ? {
            personId: auth.user.id,
            accountId: actor.accountId,
            role: actor.role,
          }
        : null,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/events/cancel failed", error);
    return apiJson({
      status: 500,
      message: tr("somethingWentWrong"),
    });
  }
}
