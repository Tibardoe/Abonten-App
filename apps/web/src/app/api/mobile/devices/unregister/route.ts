import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { unregisterDeviceTokenCore } from "@/utils/deviceTokenCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/devices/unregister { token }
// Drops the caller's Expo push token (called on sign-out).
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ status: 400, message: "Invalid JSON body" });
  }

  if (typeof body.token !== "string") {
    return apiJson({ status: 400, message: "token is required" });
  }

  try {
    const result = await unregisterDeviceTokenCore(auth.user.id, body.token);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /devices/unregister failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
