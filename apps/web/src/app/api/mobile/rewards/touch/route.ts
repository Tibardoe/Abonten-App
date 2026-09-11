import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { recordReferralTouchCore } from "@abonten/services/rewards/referralCore";

// POST /api/mobile/rewards/touch
//   { code, eventId?, placeId?, source? }
// The app opened a referral link. Accepted signed out too (a visitor who
// installs and signs up later still counts through the app's own capture
// store); when a Bearer token is present it must be valid, and the touch is
// then also remembered for that user's later checkout on any device.
// Always answers 202 -- it's fire-and-forget and reveals nothing about the
// code.
export async function POST(req: Request) {
  let visitorUserId: string | null = null;
  if (req.headers.get("authorization")) {
    const auth = await getMobileAuth(req);
    if (auth.response) return auth.response;
    visitorUserId = auth.user.id;
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      code?: unknown;
      eventId?: unknown;
      placeId?: unknown;
      source?: unknown;
    } | null;
    if (typeof body?.code !== "string") {
      return apiJson({ status: 400, message: "code is required" });
    }

    const platform =
      req.headers.get("x-abonten-platform") === "ios" ? "ios" : "android";
    const result = await recordReferralTouchCore({
      code: body.code,
      eventId: typeof body.eventId === "string" ? body.eventId : null,
      placeId: typeof body.placeId === "string" ? body.placeId : null,
      visitorUserId,
      installId: req.headers.get("x-abonten-install-id"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
      platform,
      source:
        body.source === "qr" || body.source === "install_referrer"
          ? body.source
          : "link",
    });
    return apiJson({ status: result.status === 202 ? 202 : result.status });
  } catch (error) {
    logger.error("mobile POST /rewards/touch failed", error);
    return apiJson({ status: 202 });
  }
}
