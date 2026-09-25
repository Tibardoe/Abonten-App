import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getListingMarketCore } from "@abonten/services/markets/marketContextCore";

// GET /api/mobile/markets/at?lat=..&lng=..&country=GB
//
// The market a venue point belongs to — which currency the organizer's
// prices are in and which zone the times are read in — for the create/edit
// event and place forms. Same resolver the save path uses.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return apiJson({ status: 400, message: "lat and lng are required" });
    }
    const result = await getListingMarketCore({
      lat,
      lng,
      countryHint: url.searchParams.get("country"),
    });
    if (!result.ok) return apiJson({ status: 422, message: result.message });
    return apiJson({ status: 200, data: result });
  } catch (error) {
    logger.error("mobile GET /markets/at failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
