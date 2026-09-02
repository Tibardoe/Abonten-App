import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  fetchPlaceDraftsList,
  savePlaceDraftCore,
} from "@abonten/services/places/placeDraftCore";
import type { PlaceDraftPayload } from "@abonten/validation/placeDraftSchema";

// GET  /api/mobile/organizer/place-drafts   -> the caller's non-expired place drafts
// POST /api/mobile/organizer/place-drafts   { draftId?, payload, expectedUpdatedAt?, coverPublicId?, coverVersion? }
//   Create or update a place draft. The cover is uploaded from the device
//   first (kind "place_photo"); pass its public_id/version, or omit both.
//   The payload is re-validated with the real draft-safe Zod schema in the core.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await fetchPlaceDraftsList(auth.supabase, auth.user.id);
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /organizer/place-drafts failed", error);
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
      coverPublicId?: unknown;
      coverVersion?: unknown;
    } | null;

    if (!body || typeof body.payload !== "object" || body.payload === null) {
      return apiJson({ status: 400, message: "payload is required" });
    }

    const result = await savePlaceDraftCore(auth.supabase, auth.user.id, {
      draftId: typeof body.draftId === "string" ? body.draftId : undefined,
      payload: body.payload as PlaceDraftPayload,
      expectedUpdatedAt:
        typeof body.expectedUpdatedAt === "string"
          ? body.expectedUpdatedAt
          : undefined,
      coverPublicId:
        typeof body.coverPublicId === "string" && body.coverPublicId.length > 0
          ? body.coverPublicId
          : undefined,
      coverVersion:
        body.coverVersion === undefined || body.coverVersion === null
          ? undefined
          : String(body.coverVersion),
    });

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/place-drafts failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
