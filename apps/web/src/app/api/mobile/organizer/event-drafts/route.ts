import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  fetchEventDraftsList,
  saveEventDraftCore,
} from "@abonten/services/events/eventDraftCore";
import type { EventDraftPayload } from "@abonten/validation/eventDraftSchema";

// GET  /api/mobile/organizer/event-drafts   -> the caller's non-expired event drafts
// POST /api/mobile/organizer/event-drafts   { draftId?, payload, expectedUpdatedAt?, flyerPublicId?, flyerVersion? }
//   Create or update an event draft. The flyer is uploaded from the device
//   first (kind "event_flyer"); pass its public_id/version, or omit both.
//   The payload is re-validated with the real draft-safe Zod schema in the core.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await fetchEventDraftsList(auth.supabase, auth.user.id);
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/event-drafts failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      draftId?: unknown;
      payload?: unknown;
      expectedUpdatedAt?: unknown;
      flyerPublicId?: unknown;
      flyerVersion?: unknown;
    } | null;

    if (!body || typeof body.payload !== "object" || body.payload === null) {
      return apiJson({ status: 400, message: "payload is required" });
    }

    const result = await saveEventDraftCore(auth.supabase, auth.user.id, {
      draftId: typeof body.draftId === "string" ? body.draftId : undefined,
      payload: body.payload as EventDraftPayload,
      expectedUpdatedAt:
        typeof body.expectedUpdatedAt === "string"
          ? body.expectedUpdatedAt
          : undefined,
      flyerPublicId:
        typeof body.flyerPublicId === "string" && body.flyerPublicId.length > 0
          ? body.flyerPublicId
          : undefined,
      flyerVersion:
        body.flyerVersion === undefined || body.flyerVersion === null
          ? undefined
          : String(body.flyerVersion),
    });

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/event-drafts failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
