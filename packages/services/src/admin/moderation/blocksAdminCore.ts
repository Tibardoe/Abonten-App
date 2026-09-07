import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  ConversationBlockListItem,
} from "@abonten/types/adminTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { assertPermission } from "../adminContext";

// Read-only browser over public.conversation_block (the rows behind the
// in-app "Block" action). Blocks are enforced server-side inside
// send_message; this view just lets trust & safety see who has blocked
// whom, globally or scoped to a single conversation. There is no
// admin-side "lift block" here — a block is the user's own choice.

export type ListBlocksFilters = {
  /** blocker OR blocked matches this user id */
  userId?: string | null;
  scope?: "all" | "global" | "scoped";
  cursor?: string | null;
  pageSize?: number;
};

export async function listConversationBlocksCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListBlocksFilters = {},
): Promise<PaginatedResult<ConversationBlockListItem>> {
  try {
    assertPermission(ctx, "users.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("conversation_block")
    .select("id, blocker_id, blocked_id, conversation_id, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.userId) {
    query = query.or(
      `blocker_id.eq.${filters.userId},blocked_id.eq.${filters.userId}`,
    );
  }
  if (filters.scope === "global") {
    query = query.is("conversation_id", null);
  } else if (filters.scope === "scoped") {
    query = query.not("conversation_id", "is", null);
  }
  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listConversationBlocksCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];

  const userIds = [
    ...new Set(
      rows.flatMap((r) => [r.blocker_id as string, r.blocked_id as string]),
    ),
  ];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_info")
      .select("id, full_name, username")
      .in("id", userIds);
    for (const p of profiles ?? [])
      names.set(p.id, p.full_name || p.username || p.id.slice(0, 8));
  }

  const convIds = [
    ...new Set(
      rows
        .map((r) => r.conversation_id as string | null)
        .filter((x): x is string => !!x),
    ),
  ];
  const convTypes = new Map<string, string>();
  if (convIds.length > 0) {
    const { data: convs } = await supabase
      .from("conversation")
      .select("id, type")
      .in("id", convIds);
    for (const c of convs ?? []) convTypes.set(c.id, c.type as string);
  }

  const mapped: ConversationBlockListItem[] = rows.map((r) => ({
    id: r.id as string,
    blockerId: r.blocker_id as string,
    blockerName: names.get(r.blocker_id as string) ?? null,
    blockedId: r.blocked_id as string,
    blockedName: names.get(r.blocked_id as string) ?? null,
    conversationId: (r.conversation_id as string) ?? null,
    conversationType: r.conversation_id
      ? (convTypes.get(r.conversation_id as string) ?? null)
      : null,
    createdAt: r.created_at as string,
  }));

  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}
