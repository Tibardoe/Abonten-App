import { api } from "@/lib/api";
import type {
  ConversationFilter,
  ConversationListItem,
  ConversationRoleScope,
} from "@abonten/api-client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { type ConversationListNarrow, messagingKeys } from "./keys";

// The inbox list. Keyset-paginated (opaque cursor), newest activity first,
// with a per-conversation unread_count computed server-side. `roleScope`
// splits the unified inbox into "as customer" / "as organizer"; `narrow`
// layers the search bar + the Events / Places / Unread / Muted chips on top
// — all applied server-side by list_conversations, never in the client.
export function useConversations(
  filter: ConversationFilter = "active",
  roleScope: ConversationRoleScope = "all",
  narrow: ConversationListNarrow = {},
) {
  return useInfiniteQuery({
    queryKey: messagingKeys.list(filter, roleScope, narrow),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.messaging.list({
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
  pages: { data?: ConversationListItem[] }[] | undefined,
): ConversationListItem[] {
  // An error envelope ({ status, message }) has no `data` array — skip it so
  // a transient 401/500 (e.g. the first inbox fetch firing the instant after
  // sign-in) can't put `undefined` into the FlatList and crash keyExtractor.
  return pages?.flatMap((p) => (Array.isArray(p.data) ? p.data : [])) ?? [];
}

/** True when any loaded page came back as an error envelope rather than a
 *  real result — the screen shows its "couldn't load / retry" state. */
export function hasConversationsPageError(
  pages: { status?: number }[] | undefined,
): boolean {
  return (
    pages?.some((p) => typeof p.status === "number" && p.status >= 400) ?? false
  );
}
