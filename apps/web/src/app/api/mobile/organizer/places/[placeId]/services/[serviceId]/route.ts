import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { updatePlaceServiceCore } from "@/utils/placeServiceCore";
import { logger } from "@abonten/core/logger";

// PATCH /api/mobile/organizer/places/:placeId/services/:serviceId
//   { name?, description?, price?, priceUnit?, showPrice? }
// Edits one service — same body as updatePlaceService. `null` clears a
// field; an omitted key leaves it unchanged. 403 unless the caller owns
// the service's place.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ placeId: string; serviceId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { serviceId } = await params;
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body) {
      return apiJson({ status: 400, message: "A JSON body is required" });
    }

    const patch: {
      serviceId: string;
      name?: string;
      description?: string | null;
      price?: number | null;
      priceUnit?: string | null;
      showPrice?: boolean;
    } = { serviceId };

    if (typeof body.name === "string") patch.name = body.name.trim();
    if ("description" in body) {
      patch.description =
        typeof body.description === "string" && body.description.length > 0
          ? body.description
          : null;
    }
    if ("price" in body) {
      const p = body.price;
      if (p === null || p === undefined || p === "") {
        patch.price = null;
      } else {
        const n = Number(p);
        if (!Number.isFinite(n)) {
          return apiJson({ status: 400, message: "price must be a number" });
        }
        patch.price = n;
      }
    }
    if ("priceUnit" in body) {
      patch.priceUnit =
        typeof body.priceUnit === "string" && body.priceUnit.length > 0
          ? body.priceUnit
          : null;
    }
    if (typeof body.showPrice === "boolean") patch.showPrice = body.showPrice;

    const result = await updatePlaceServiceCore(
      auth.supabase,
      auth.user.id,
      patch,
    );

    return fromActionResult(result);
  } catch (error) {
    logger.error(
      "mobile PATCH /organizer/places/:id/services/:serviceId failed",
      error,
    );
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
