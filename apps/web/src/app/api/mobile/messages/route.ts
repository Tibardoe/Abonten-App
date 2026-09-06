import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { fetchConversationsPage } from "@abonten/services/messaging/conversationsQuery";
import { conversationFilterSchema } from "@abonten/validation/messageSchema";

// GET /api/mobile/messages?filter=active|archived|all|unread&cursor=<opaque>&pageSize=<n>
// The signed-in user's inbox, newest activity first, with per-conversation
// unread counts. Same body as the getConversations Server Action.
export async function GET(req: Request) {
  const auth = await getMobileAuth(req);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const filter = conversationFilterSchema.safeParse(
      searchParams.get("filter") ?? undefined,
    );
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;

    const result = await fetchConversationsPage(auth.supabase, auth.user.id, {
      filter: filter.success ? filter.data : "active",
      cursor,
      pageSize:
        pageSize && Number.isFinite(pageSize) && pageSize > 0
          ? pageSize
          : undefined,
    });
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /messages failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
