import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { getConversationContext } from "@abonten/services/messaging/conversationsQuery";

// GET /api/mobile/messages/<conversationId>
// Header/context for one conversation — subject (event/place), participants
// + profiles, my participant row, blocked ids. 404 if the caller isn't a
// participant (RLS hides the row). Mirrors the getConversationDetail action.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ conversationId: string }> },
) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { conversationId } = await ctx.params;
    if (!conversationId) {
      return apiJson({ status: 400, message: "conversationId is required" });
    }

    const result = await getConversationContext(
      auth.supabase,
      auth.user.id,
      conversationId,
    );
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /messages/:id failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
