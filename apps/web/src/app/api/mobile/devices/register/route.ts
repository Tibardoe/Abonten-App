import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { registerDeviceTokenCore } from "@/utils/deviceTokenCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/devices/register { token, platform: "ios" | "android" }
// Saves the caller's Expo push token so createNotification can push to it.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  let body: { token?: unknown; platform?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ status: 400, message: "Invalid JSON body" });
  }

  try {
    const result = await registerDeviceTokenCore(auth.user.id, body);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /devices/register failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
