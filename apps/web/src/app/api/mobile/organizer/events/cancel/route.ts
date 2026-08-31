import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { cancelEventCore } from "@/utils/cancelEventCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/events/cancel { eventId }
// Cancels an event, releases every ticket, starts attendee refunds and
// queues the notification emails — the full cancelEvent path. Ownership +
// idempotency are enforced by the cancel_event_and_release_tickets RPC.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  let body: { eventId?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ status: 400, message: "Invalid JSON body" });
  }

  if (typeof body.eventId !== "string") {
    return apiJson({ status: 400, message: "eventId is required" });
  }

  try {
    const result = await cancelEventCore(auth.supabase, body.eventId);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/events/cancel failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
