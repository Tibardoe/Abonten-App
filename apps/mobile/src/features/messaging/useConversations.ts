import { api } from "@/lib/api";
import type {
  ConversationFilter,
  ConversationListItem,
} from "@abonten/api-client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// The inbox list. Keyset-paginated (opaque cursor), newest activity first,
// with a per-conversation unread_count computed server-side. `unread` is a
// server filter, not a client one — the RPC only returns conversations with
// at least one unread message when asked.
export function useConversations(filter: ConversationFilter = "active") {
  return useInfiniteQuery({
    queryKey: messagingKeys.list(filter),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.messaging.list({ filter, cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: 15_000,
  });
}

export function flattenConversations(
  pages: { data: ConversationListItem[] }[] | undefined,
): ConversationListItem[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
