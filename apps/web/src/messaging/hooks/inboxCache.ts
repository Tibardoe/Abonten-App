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
import type { ConversationListItem } from "@abonten/types/messagingType";
import type { QueryClient } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// Applies a conversation-row change to every cached inbox view at once.
//
// The inbox is cached per (filter x roleScope x search x type x muted), so one
// conversation can sit in several cached lists at the same time. setQueriesData
// walks all of them; the pure transforms in @abonten/core return the same
// reference for views that don't hold the row, so untouched views notify no
// observers and re-render nothing.
//
// This matters more on web than on native: the workspace is a two-pane layout,
// so ConversationList stays mounted next to the open thread. An invalidation
// there is always an *active* refetch the user can see.

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

/** Move the Messages nav badge by `delta`, clamped at zero. */
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
 * Apply a realtime `conversation` bump to every cached inbox view. Returns
 * false when no cached view held the row — the caller then falls back to
 * invalidation, because a conversation the user has never scrolled to can't
 * be positioned without the server's ordering.
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

/**
 * Snapshot every cached inbox view so a failed optimistic write can be put
 * back exactly as it was. Cheap: pages are shared by reference.
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
