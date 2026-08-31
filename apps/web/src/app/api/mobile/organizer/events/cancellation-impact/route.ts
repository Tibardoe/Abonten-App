import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { getEventCancellationImpactCore } from "@/utils/cancelEventCore";
import { logger } from "@abonten/core/logger";

// GET /api/mobile/organizer/events/cancellation-impact?eventId=<uuid>
// Server-verified counts for the cancel-event confirmation screen. Same
// body as getEventCancellationImpact; ownership is enforced by the
// get_event_cancellation_impact RPC.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return apiJson({ status: 400, message: "eventId is required" });
  }

  try {
    const result = await getEventCancellationImpactCore(auth.supabase, eventId);
    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile GET /organizer/events/cancellation-impact failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
