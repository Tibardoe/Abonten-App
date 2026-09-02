import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson, fromActionResult } from "@/app/api/mobile/_lib/response";
import { deleteHighlightGroupCore } from "@/utils/highlightDeleteCore";
import { logger } from "@abonten/core/logger";

// POST /api/mobile/highlights/group/delete   { groupId }
// Deletes every slide in a highlight group the caller owns, Cloudinary
// asset first (highlight_owner_delete RLS + the core's own ownership scope).
export async function POST(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const body = (await req.json().catch(() => null)) as {
      groupId?: unknown;
    } | null;

    if (typeof body?.groupId !== "string" || body.groupId.length === 0) {
      return apiJson({ status: 400, message: "groupId is required" });
    }

    const result = await deleteHighlightGroupCore(
      auth.supabase,
      auth.user.id,
      body.groupId,
    );
    return fromActionResult(result);
  } catch (error) {
    logger.error("mobile POST /highlights/group/delete failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
