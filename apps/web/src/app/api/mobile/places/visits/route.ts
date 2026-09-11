import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { recordPlaceVisitCore } from "@abonten/services/places/placeVisitCore";

// POST /api/mobile/places/visits
// Body: { placeId?, placeSlug?, code, lat, lng, accuracyM?, mocked? }.
// Checks the caller in at a place with the code its owner shows (once a
// day). The code and the distance are checked server-side.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return apiJson({ status: 400, message: "Invalid request" });
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    return fromActionResult(
      await recordPlaceVisitCore(auth.user.id, {
        placeId: typeof body.placeId === "string" ? body.placeId : null,
        placeSlug: typeof body.placeSlug === "string" ? body.placeSlug : null,
        code: typeof body.code === "string" ? body.code : "",
        lat: num(body.lat),
        lng: num(body.lng),
        accuracyM: num(body.accuracyM),
        mocked: body.mocked === true,
        platform:
          req.headers.get("x-abonten-platform") === "ios" ? "ios" : "android",
        installId: req.headers.get("x-abonten-install-id"),
      }),
    );
  } catch (error) {
    logger.error("mobile POST /places/visits failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
