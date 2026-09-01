import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { registerForFreeEventCore } from "@/utils/registerForFreeEventCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/checkout/free-rsvp  { eventId: string, occurrenceId?: string }
//
// One-click RSVP for a free ("FREE" ticket type) event — no checkout
// session, no payment. Quantity is always 1. Same registerForFreeEventCore
// the web action runs. 200 = registered; 300 = already have a ticket;
// 404 = no free registration; 409 = not accepting / ended.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      eventId?: unknown;
      occurrenceId?: unknown;
    } | null;

    if (typeof body?.eventId !== "string" || body.eventId.length === 0) {
      return apiJson({ status: 400, message: "eventId is required" });
    }

    const occurrenceId =
      typeof body.occurrenceId === "string" ? body.occurrenceId : null;

    const result = await registerForFreeEventCore(
      auth.supabase,
      auth.user.id,
      body.eventId,
      occurrenceId,
    );

    return apiJson({ status: result.status, message: result.message });
  } catch (error) {
    logger.error("mobile POST /checkout/free-rsvp failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
