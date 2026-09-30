import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  getAreaWaitlistStatusCore,
  joinAreaWaitlistCore,
  leaveAreaWaitlistCore,
} from "@abonten/services/markets/areaWaitlistCore";

// The "tell me when it launches" waiting list for an area Abonten hasn't
// launched in. Same services as the web actions getAreaWaitlistStatus /
// joinAreaWaitlist / leaveAreaWaitlist.

function pointFrom(url: URL) {
  return { lat: url.searchParams.get("lat"), lng: url.searchParams.get("lng") };
}

// GET /api/mobile/markets/waitlist?lat=6.69&lng=-1.62
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    return fromActionResult(
      await getAreaWaitlistStatusCore(
        auth.user.id,
        pointFrom(new URL(req.url)),
      ),
    );
  } catch (error) {
    logger.error("mobile GET /markets/waitlist failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

// POST /api/mobile/markets/waitlist   body: { lat, lng, label? }
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    const body = (await req.json().catch(() => null)) as {
      lat?: unknown;
      lng?: unknown;
      label?: unknown;
    } | null;
    return fromActionResult(
      await joinAreaWaitlistCore(auth.user.id, {
        lat: body?.lat,
        lng: body?.lng,
        label: body?.label,
        source: "app",
      }),
    );
  } catch (error) {
    logger.error("mobile POST /markets/waitlist failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

// DELETE /api/mobile/markets/waitlist?lat=6.69&lng=-1.62
export async function DELETE(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;
  try {
    return fromActionResult(
      await leaveAreaWaitlistCore(auth.user.id, pointFrom(new URL(req.url))),
    );
  } catch (error) {
    logger.error("mobile DELETE /markets/waitlist failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
