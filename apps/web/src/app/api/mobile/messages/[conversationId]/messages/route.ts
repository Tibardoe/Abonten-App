import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { fetchMessagesPage } from "@abonten/services/messaging/messagesQuery";

// GET /api/mobile/messages/<conversationId>/messages?cursor=<opaque>&pageSize=<n>
// Newest-first, keyset-paginated page of one conversation's messages. RLS
// restricts this to the caller's conversations. Mirrors the
// getConversationMessages Server Action.
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

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await fetchMessagesPage(auth.supabase, conversationId, {
      cursor,
      pageSize:
        pageSize && Number.isFinite(pageSize) && pageSize > 0
          ? pageSize
          : undefined,
    });
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /messages/:id/messages failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
