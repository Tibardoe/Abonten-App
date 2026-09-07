"use client";

import { getConversationDetail } from "@/actions/getConversationDetail";
import { getConversationMessages } from "@/actions/getConversationMessages";
import type { MessageRow } from "@abonten/types/messagingType";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// Header / context for one conversation: subject (event or place), the other
// participant's profile, my mute/archive state, who I've blocked. The
// envelope carries status 404 (not a throw) when the caller isn't a
// participant.
export function useConversationDetail(conversationId: string | undefined) {
  return useQuery({
    queryKey: messagingKeys.detail(conversationId ?? "none"),
    enabled: !!conversationId,
    queryFn: () => getConversationDetail(conversationId as string),
    staleTime: 30_000,
  });
}

// One conversation's messages, newest-first, keyset-paginated (scroll up for
// older). `flatMap` across pages yields newest -> oldest, which the thread
// renders bottom-up (flex-col-reverse) so index 0 sits at the bottom.
// Soft-deleted rows arrive redacted but keep their slot.
export function useConversationMessages(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: messagingKeys.messages(conversationId ?? "none"),
    enabled: !!conversationId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getConversationMessages(conversationId as string, {
        cursor: pageParam,
        pageSize: 30,
      }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: 10_000,
  });
}

export function flattenMessages(
  pages: { data: MessageRow[] }[] | undefined,
): MessageRow[] {
  return pages?.flatMap((p) => p.data) ?? [];
}
