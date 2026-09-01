import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { type PostPlaceCoreInput, postPlaceCore } from "@/utils/postPlaceCore";
import { logger } from "@abonten/core/logger";
import type {
  PlaceOpeningHoursInput,
  PlaceServiceInput,
} from "@abonten/types/placeType";

// POST /api/mobile/places
//   { name, categoryId, description, address, latitude, longitude,
//     coverPublicId, coverVersion, openingHours[], clientRequestId,
//     websiteUrl?, phone?, whatsapp?, socialLinks?, services?, draftId? }
//
// Publishes a place. The cover photo is uploaded from the device first
// (signed direct upload, kind "place_photo"); its public_id/version come in
// here. Runs the same postPlaceCore the web postPlace action runs.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body) {
      return apiJson({ status: 400, message: "Invalid request body" });
    }

    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

    const name = str(body.name);
    const description = str(body.description);
    const address = str(body.address);
    const coverPublicId = str(body.coverPublicId);
    const coverVersion = str(body.coverVersion);
    const clientRequestId = str(body.clientRequestId);
    const categoryId =
      typeof body.categoryId === "number" ? body.categoryId : null;
    const latitude = typeof body.latitude === "number" ? body.latitude : null;
    const longitude =
      typeof body.longitude === "number" ? body.longitude : null;

    if (
      !name ||
      !description ||
      !address ||
      !coverPublicId ||
      !coverVersion ||
      !clientRequestId ||
      categoryId === null ||
      latitude === null ||
      longitude === null
    ) {
      return apiJson({
        status: 400,
        message:
          "name, categoryId, description, address, latitude, longitude, coverPublicId, coverVersion and clientRequestId are required",
      });
    }

    if (!Array.isArray(body.openingHours)) {
      return apiJson({ status: 400, message: "openingHours must be an array" });
    }

    const input: PostPlaceCoreInput = {
      name,
      categoryId,
      description,
      address,
      latitude,
      longitude,
      websiteUrl: str(body.websiteUrl),
      phone: str(body.phone),
      whatsapp: str(body.whatsapp),
      socialLinks:
        body.socialLinks && typeof body.socialLinks === "object"
          ? (body.socialLinks as Record<string, string>)
          : null,
      coverPublicId,
      coverVersion,
      openingHours: body.openingHours as PlaceOpeningHoursInput[],
      services: Array.isArray(body.services)
        ? (body.services as PlaceServiceInput[])
        : null,
      clientRequestId,
      draftId: str(body.draftId),
    };

    const result = await postPlaceCore(auth.supabase, auth.user.id, input);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /places failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
