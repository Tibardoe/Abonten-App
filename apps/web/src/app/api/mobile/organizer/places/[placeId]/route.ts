import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { updatePlaceCore } from "@abonten/services/places/updatePlaceCore";

// PATCH /api/mobile/organizer/places/:placeId
//   { name, description, categoryId, address, latitude, longitude,
//     websiteUrl?, phone?, whatsapp?, socialLinks?,
//     coverPublicId?, coverVersion? }
// Edits a place's core fields — same body as updatePlace. A replacement
// cover is uploaded from the device first; pass both coverPublicId /
// coverVersion, or omit both to keep the current one. Hours / services /
// the photo gallery have their own endpoints. 403 if not the caller's.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { placeId } = await params;
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    const categoryId = Number(body?.categoryId);
    const address =
      typeof body?.address === "string" ? body.address.trim() : "";
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);

    if (
      !name ||
      !description ||
      !Number.isFinite(categoryId) ||
      !address ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return apiJson({
        status: 400,
        message:
          "name, description, categoryId, address, latitude and longitude are required",
      });
    }

    const str = (v: unknown) =>
      typeof v === "string" && v.length > 0 ? v : undefined;

    const coverPublicId = str(body?.coverPublicId);
    const coverVersion = str(body?.coverVersion);

    const result = await updatePlaceCore(auth.supabase, auth.user.id, {
      placeId,
      name,
      description,
      categoryId,
      websiteUrl: str(body?.websiteUrl) ?? null,
      phone: str(body?.phone) ?? null,
      whatsapp: str(body?.whatsapp) ?? null,
      socialLinks:
        body?.socialLinks && typeof body.socialLinks === "object"
          ? (body.socialLinks as Record<string, string>)
          : null,
      address,
      latitude,
      longitude,
      ...(coverPublicId && coverVersion ? { coverPublicId, coverVersion } : {}),
    });

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile PATCH /organizer/places/:id failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
