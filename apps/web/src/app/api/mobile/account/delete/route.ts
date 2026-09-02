import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { deleteAccountCore } from "@abonten/services/profile/deleteAccountCore";

// POST /api/mobile/account/delete
// Permanently deletes the caller's own auth user (service-role admin op).
// Same effect as the web deleteUser action; both call deleteAccountCore.
// The mobile client signs out locally on a 200.
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const result = await deleteAccountCore(auth.user.id);
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /account/delete failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
