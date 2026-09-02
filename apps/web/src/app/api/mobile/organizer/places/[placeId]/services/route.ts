import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { addPlaceServiceCore } from "@/utils/placeServiceCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/organizer/places/:placeId/services
//   { name, description?, price?, priceUnit?, showPrice: boolean }
// Adds a service to the caller's own place — same body as addPlaceService.
// 404 unless the place is the caller's.
export async function POST(
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
    if (!name) {
      return apiJson({ status: 400, message: "name is required" });
    }

    const priceRaw = body?.price;
    const price =
      priceRaw === undefined || priceRaw === null || priceRaw === ""
        ? null
        : Number(priceRaw);
    if (price !== null && !Number.isFinite(price)) {
      return apiJson({ status: 400, message: "price must be a number" });
    }

    const result = await addPlaceServiceCore(auth.supabase, auth.user.id, {
      placeId,
      name,
      description:
        typeof body?.description === "string" && body.description.length > 0
          ? body.description
          : null,
      price,
      priceUnit:
        typeof body?.priceUnit === "string" && body.priceUnit.length > 0
          ? body.priceUnit
          : null,
      showPrice: body?.showPrice !== false,
    });

    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /organizer/places/:id/services failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
