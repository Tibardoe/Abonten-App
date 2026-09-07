"use client";

import { getConversations } from "@/actions/getConversations";
import type {
  ConversationFilter,
  ConversationListItem,
} from "@abonten/types/messagingType";
import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// The inbox list. Keyset-paginated (opaque cursor), newest activity first,
// with a per-conversation unread_count computed server-side. `unread` is a
// server filter, not a client one.
export function useConversations(filter: ConversationFilter = "active") {
  return useInfiniteQuery({
    queryKey: messagingKeys.list(filter),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getConversations({ filter, cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: 15_000,
  });
}

export function flattenConversations(
  pages: { data: ConversationListItem[] }[] | undefined,
): ConversationListItem[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
