import type { ConversationListItem } from "@abonten/api-client";
import {
  type ConversationListCache,
  type LastMessageBump,
  bumpConversationInPages,
  markConversationReadInPages,
  markConversationUnreadInPages,
  patchConversationInPages,
  removeConversationFromPages,
  unreadCountInPages,
} from "@abonten/core/messagingInboxCache";
import type { QueryClient } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// Applies a conversation-row change to every cached inbox view at once.
//
// The inbox is cached per (filter x roleScope x search x type x muted), so a
// single conversation can be present in several cached lists simultaneously.
// setQueriesData walks all of them; the pure transforms return the same
// reference for views that don't hold the row, so only the views that
// actually changed notify their observers.

type Lists = ConversationListCache | undefined;

/** The unread count held for a conversation by whichever cached view has it. */
export function readUnreadCount(
  qc: QueryClient,
  conversationId: string,
): number {
  const entries = qc.getQueriesData<ConversationListCache>({
    queryKey: messagingKeys.lists(),
  });
  for (const [, cache] of entries) {
    const n = unreadCountInPages(cache, conversationId);
    if (n !== null) return n;
  }
  return 0;
}

/** Move the Messages tab badge by `delta`, clamped at zero. */
export function adjustUnreadBadge(qc: QueryClient, delta: number): void {
  if (delta === 0) return;
  qc.setQueriesData<number>(
    { queryKey: messagingKeys.unreadCount() },
    (prev) => (typeof prev === "number" ? Math.max(0, prev + delta) : prev),
  );
}

export function applyConversationRead(
  qc: QueryClient,
  conversationId: string,
  readAt = new Date().toISOString(),
): void {
  qc.setQueriesData<Lists>({ queryKey: messagingKeys.lists() }, (cache) =>
    markConversationReadInPages(cache, conversationId, readAt),
  );
}

export function applyConversationUnread(
  qc: QueryClient,
  conversationId: string,
): void {
  qc.setQueriesData<Lists>({ queryKey: messagingKeys.lists() }, (cache) =>
    markConversationUnreadInPages(cache, conversationId),
  );
}

export function applyConversationPatch(
  qc: QueryClient,
  conversationId: string,
  patch: Partial<ConversationListItem>,
): void {
  qc.setQueriesData<Lists>({ queryKey: messagingKeys.lists() }, (cache) =>
    patchConversationInPages(cache, conversationId, patch),
  );
}

export function removeConversationRow(
  qc: QueryClient,
  conversationId: string,
): void {
  qc.setQueriesData<Lists>({ queryKey: messagingKeys.lists() }, (cache) =>
    removeConversationFromPages(cache, conversationId),
  );
}

/**
 * Snapshot every cached inbox view so a failed optimistic write can be put
 * back exactly as it was, then restore it. Cheap: the pages themselves are
 * shared by reference, only the top-level array is copied.
 */
export function snapshotLists(qc: QueryClient) {
  return qc.getQueriesData<ConversationListCache>({
    queryKey: messagingKeys.lists(),
  });
}

export function restoreLists(
  qc: QueryClient,
  snapshot: ReturnType<typeof snapshotLists>,
): void {
  for (const [key, cache] of snapshot) qc.setQueryData(key, cache);
}

/**
 * Apply a realtime `conversation` bump to every cached inbox view.
 *
 * Returns false when no cached view held the row — the caller then falls back
 * to invalidation, because a conversation the user has never scrolled to
 * can't be placed correctly without the server's ordering.
 */
export function bumpConversationRow(
  qc: QueryClient,
  conversationId: string,
  bump: LastMessageBump,
  unreadDelta = 0,
): boolean {
  let patched = false;
  qc.setQueriesData<Lists>({ queryKey: messagingKeys.lists() }, (cache) => {
    const next = bumpConversationInPages(
      cache,
      conversationId,
      bump,
      unreadDelta,
    );
    if (next !== cache) patched = true;
    return next;
  });
  return patched;
}
