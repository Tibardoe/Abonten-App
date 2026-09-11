import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import {
  getRewardEmailPreferenceCore,
  setRewardEmailPreferenceCore,
} from "@abonten/services/notifications/rewardEmailPreferenceCore";

// GET /api/mobile/notifications/reward-emails
// Whether the caller gets Abonten Rewards emails, and their email address
// (null for phone-only accounts). Same service as getRewardEmailPreference.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    return fromActionResult(await getRewardEmailPreferenceCore(auth.user.id));
  } catch (error) {
    logger.error("mobile GET /notifications/reward-emails failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}

// PUT /api/mobile/notifications/reward-emails
// Body: { enabled: boolean }. Same service as setRewardEmailPreference.
export async function PUT(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      enabled?: unknown;
    } | null;
    return fromActionResult(
      await setRewardEmailPreferenceCore(auth.user.id, {
        enabled: body?.enabled,
      }),
    );
  } catch (error) {
    logger.error("mobile PUT /notifications/reward-emails failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
