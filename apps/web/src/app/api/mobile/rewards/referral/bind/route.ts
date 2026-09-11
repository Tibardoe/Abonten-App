import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import type { InviteSource } from "@abonten/core/rewards/invite";
import { bindReferralCodeCore } from "@abonten/services/rewards/inviteCore";
import { recordDeviceInstallCore } from "@abonten/services/rewards/referralCore";

// POST /api/mobile/rewards/referral/bind   { code, source? }
// Joins the caller to a friend's invite (an /invite link the app opened, the
// Play install referrer, or a code typed at sign-in). The code is only a
// hint: referral_bind decides (new account, first bind wins, no circles).
// Always 200 with { result } for a decided answer; 400 for a malformed
// code, 429 when rate-limited.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      code?: unknown;
      source?: unknown;
    } | null;
    if (typeof body?.code !== "string") {
      return apiJson({ status: 400, message: "code is required" });
    }
    const source: InviteSource =
      body.source === "typed" || body.source === "install_referrer"
        ? body.source
        : "link";

    // The fraud checks compare devices: note this install before binding.
    await recordDeviceInstallCore(
      req.headers.get("x-abonten-install-id"),
      auth.user.id,
      req.headers.get("x-abonten-platform") === "ios" ? "ios" : "android",
    );

    const result = await bindReferralCodeCore(auth.user.id, {
      code: body.code,
      source,
    });
    return apiJson(result);
  } catch (error) {
    logger.error("mobile POST /rewards/referral/bind failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
