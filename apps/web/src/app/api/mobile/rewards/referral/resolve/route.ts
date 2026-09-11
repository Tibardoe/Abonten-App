import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  invitesLiveCore,
  resolveReferralCodeCore,
} from "@abonten/services/rewards/inviteCore";

// GET /api/mobile/rewards/referral/resolve?code=K7QX2MA
// What the app's invite screen shows for a code: the inviter's first name
// and the offer. Public (the person opening an invite usually isn't signed
// up yet); rate-limited per IP so codes can't be enumerated. With no code it
// only says whether invites are live (the sign-in screen's invite field).
export async function GET(req: Request) {
  try {
    const code = new URL(req.url).searchParams.get("code") ?? "";
    if (!code) {
      return apiJson({
        status: 200,
        data: {
          valid: false,
          code: null,
          programOn: await invitesLiveCore(),
          referrerName: null,
          referrerAvatar: null,
          welcomeMinor: null,
          minOrderMinor: null,
        },
      });
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const result = await resolveReferralCodeCore(
      code,
      ip ?? req.headers.get("x-abonten-install-id"),
    );
    return apiJson({
      status: result.status,
      data: result.data,
      message: result.status === 429 ? "Too many requests" : undefined,
    });
  } catch (error) {
    logger.error("mobile GET /rewards/referral/resolve failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
