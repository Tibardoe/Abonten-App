"use client";

import { getConversations } from "@/actions/getConversations";
import type {
  ConversationFilter,
  ConversationListItem,
  ConversationRoleScope,
} from "@abonten/types/messagingType";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type ConversationListNarrow, messagingKeys } from "./keys";

// The inbox list. Keyset-paginated (opaque cursor), newest activity first,
// with a per-conversation unread_count computed server-side. `roleScope`
// splits the unified inbox into "as customer" / "as organizer"; `narrow`
// layers the search bar + the Events / Places / Unread / Muted chips —
// all applied server-side by list_conversations.
export function useConversations(
  filter: ConversationFilter = "active",
  roleScope: ConversationRoleScope = "all",
  narrow: ConversationListNarrow = {},
) {
  return useInfiniteQuery({
    queryKey: messagingKeys.list(filter, roleScope, narrow),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getConversations({
        filter,
        roleScope,
        cursor: pageParam,
        pageSize: 20,
        search: narrow.search,
        type: narrow.type,
        muted: narrow.muted,
      }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: 15_000,
  });
}

export function flattenConversations(
  pages: { data: ConversationListItem[] }[] | undefined,
): ConversationListItem[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
