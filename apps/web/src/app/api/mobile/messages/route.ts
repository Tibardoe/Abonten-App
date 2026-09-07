import { getMobileAuth } from "@/app/api/mobile/_lib/authedClient";
import { apiJson } from "@/app/api/mobile/_lib/response";
import { logger } from "@abonten/core/logger";
import { fetchConversationsPage } from "@abonten/services/messaging/conversationsQuery";
import {
  conversationFilterSchema,
  conversationListQuerySchema,
} from "@abonten/validation/messageSchema";

// GET /api/mobile/messages?filter=active|archived|all|unread&roleScope=all|member|business
//   &cursor=<opaque>&pageSize=<n>&search=<text>&type=event|place|support&muted=true|false
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
    const roleScopeParam = searchParams.get("roleScope");
    const roleScope =
      roleScopeParam === "member" || roleScopeParam === "business"
        ? roleScopeParam
        : "all";
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const pageSize = pageSizeParam ? Number(pageSizeParam) : undefined;
    const mutedParam = searchParams.get("muted");
    const narrow = conversationListQuerySchema.safeParse({
      search: searchParams.get("search") ?? undefined,
      type: searchParams.get("type") ?? undefined,
      muted:
        mutedParam === "true"
          ? true
          : mutedParam === "false"
            ? false
            : undefined,
    });

    const result = await fetchConversationsPage(auth.supabase, auth.user.id, {
      filter: filter.success ? filter.data : "active",
      roleScope,
      cursor,
      pageSize:
        pageSize && Number.isFinite(pageSize) && pageSize > 0
          ? pageSize
          : undefined,
      search: narrow.success ? narrow.data.search : undefined,
      type: narrow.success ? narrow.data.type : undefined,
      muted: narrow.success ? narrow.data.muted : undefined,
    });
    return apiJson(result);
  } catch (error) {
    logger.error("mobile GET /messages failed", error);
    return apiJson({ status: 500, message: "Something went wrong!" });
  }
}
