import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import type { MessageRow } from "@abonten/api-client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// A conversation's header + messages stay cached after the screen unmounts
// — and, for recent threads, on disk between launches (queryPersistPolicy:
// the persisted rules set their gcTime) — so stepping back in renders
// instantly, online or not, while a quiet background refetch reconciles.
// (No `placeholderData` — the query key is per-conversation, and showing the
// previous thread's rows while a new one loads would be worse than a brief
// spinner.)

// Header / context for one conversation: subject (event or place), the
// other participant's profile, my mute/archive state, who I've blocked.
// The envelope carries status 404 (not a throw) when the caller isn't a
// participant — the screen renders its own "not found" state off that.
export function useConversationDetail(conversationId: string | undefined) {
  return useQuery({
    queryKey: messagingKeys.detail(conversationId ?? "none"),
    enabled: !!conversationId,
    queryFn: async () =>
      settleEnvelope(await api.messaging.detail(conversationId as string)),
    staleTime: 30_000,
  });
}

// One conversation's messages, newest first, keyset-paginated (scroll up for
// older). Page 0 holds the newest rows, so `flatMap` across pages yields a
// newest -> oldest array — exactly what an inverted FlatList wants (index 0
// renders at the bottom). Soft-deleted rows arrive redacted (content null,
// no attachments) but keep their slot so the thread doesn't visually jump.
export function useConversationMessages(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: messagingKeys.messages(conversationId ?? "none"),
    enabled: !!conversationId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      settleEnvelope(
        await api.messaging.messages(conversationId as string, {
          cursor: pageParam,
          pageSize: 30,
        }),
      ),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: 10_000,
  });
}

export function flattenMessages(
  pages: { data?: MessageRow[] }[] | undefined,
): MessageRow[] {
  // Skip any error-envelope page ({ status, message }, no `data` array) so a
  // transient failure can't inject `undefined` into the thread list.
  return pages?.flatMap((p) => (Array.isArray(p.data) ? p.data : [])) ?? [];
}
