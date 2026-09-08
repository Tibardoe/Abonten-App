import type { ConversationListItem } from "@abonten/types/messagingType";

// Pure transforms over a cached, keyset-paginated inbox (the shape React
// Query's useInfiniteQuery holds). Framework-free on purpose: web and mobile
// both hold the identical cache shape, so the reconciliation rules live here
// once and each app only supplies its own setQueryData plumbing.
//
// Why this exists: mark-read / mute / archive all write to
// `conversation_participant` only — never to `conversation` — so the inbox
// realtime channel (which watches `conversation`) never fires for them. The
// mutation hooks used to compensate by invalidating every inbox list, which
// refetched *all* loaded pages of *every* cached filter/scope combination on
// something as routine as opening a thread. These let the caller patch the
// one row that actually changed instead.

export type ConversationListPage = { data: ConversationListItem[] };

export type ConversationListCache = {
  pages: ConversationListPage[];
  pageParams: unknown[];
};

// Every helper below returns the *same object reference* when nothing
// matched. React Query treats an unchanged reference as "no update" and
// skips notifying observers, so a patch aimed at a conversation that isn't
// in this particular cached view costs nothing and re-renders nothing.
function mapMatchingRow(
  cache: ConversationListCache | undefined,
  conversationId: string,
  update: (row: ConversationListItem) => ConversationListItem,
): ConversationListCache | undefined {
  if (!cache) return cache;
  let hit = false;
  const pages = cache.pages.map((page) => {
    let pageHit = false;
    const data = page.data.map((row) => {
      if (row.conversation_id !== conversationId) return row;
      const next = update(row);
      if (next === row) return row;
      pageHit = true;
      hit = true;
      return next;
    });
    return pageHit ? { ...page, data } : page;
  });
  return hit ? { ...cache, pages } : cache;
}

/** Patch arbitrary fields on one conversation row across every loaded page. */
export function patchConversationInPages(
  cache: ConversationListCache | undefined,
  conversationId: string,
  patch: Partial<ConversationListItem>,
): ConversationListCache | undefined {
  return mapMatchingRow(cache, conversationId, (row) => ({ ...row, ...patch }));
}

/**
 * The unread count this cached view currently holds for a conversation, or
 * null when the row isn't loaded here. Callers use it to move the tab badge
 * by exactly the right amount instead of refetching the count endpoint.
 */
export function unreadCountInPages(
  cache: ConversationListCache | undefined,
  conversationId: string,
): number | null {
  if (!cache) return null;
  for (const page of cache.pages) {
    for (const row of page.data) {
      if (row.conversation_id === conversationId) return row.unread_count;
    }
  }
  return null;
}

/**
 * Read state, applied exactly the way list_conversations would compute it:
 * unread_count drops to 0 and my_last_read_at advances. Never moves the
 * marker backwards — a realtime row that already read further wins.
 */
export function markConversationReadInPages(
  cache: ConversationListCache | undefined,
  conversationId: string,
  readAt: string,
): ConversationListCache | undefined {
  return mapMatchingRow(cache, conversationId, (row) => {
    const alreadyRead = row.unread_count === 0 && row.my_last_read_at >= readAt;
    if (alreadyRead) return row;
    return {
      ...row,
      unread_count: 0,
      my_last_read_at:
        row.my_last_read_at > readAt ? row.my_last_read_at : readAt,
    };
  });
}

/**
 * The inverse (swipe "mark unread" / row menu). The server rewinds the read
 * cursor to just before the last inbound message and no-ops when there is
 * nothing inbound — which the client can't know — so this shows 1 as a
 * placeholder and the caller reconciles from the server's own row.
 */
export function markConversationUnreadInPages(
  cache: ConversationListCache | undefined,
  conversationId: string,
): ConversationListCache | undefined {
  return mapMatchingRow(cache, conversationId, (row) =>
    row.unread_count > 0 ? row : { ...row, unread_count: 1 },
  );
}

/** Drop a row entirely — archiving out of the active list, or unarchiving. */
export function removeConversationFromPages(
  cache: ConversationListCache | undefined,
  conversationId: string,
): ConversationListCache | undefined {
  if (!cache) return cache;
  let hit = false;
  const pages = cache.pages.map((page) => {
    const data = page.data.filter((row) => {
      if (row.conversation_id !== conversationId) return true;
      hit = true;
      return false;
    });
    return hit && data.length !== page.data.length ? { ...page, data } : page;
  });
  return hit ? { ...cache, pages } : cache;
}

export type LastMessageBump = {
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
};

/**
 * Apply a `conversation` row's last_message_* bump straight from the realtime
 * payload and re-seat the row at the top of the list.
 *
 * The inbox is ordered newest-activity-first, so a conversation that just
 * received a message belongs at the front of page 0 — which is precisely what
 * a refetch would have produced. Doing it here means sending or receiving a
 * message reorders the inbox without a network round-trip.
 *
 * `unreadDelta` is applied only for inbound messages the caller isn't
 * currently reading; the caller decides that, since only it knows which
 * thread is on screen.
 *
 * Returns the same reference when the row isn't in this cached view — a
 * conversation the user has never scrolled to must NOT be synthesised into
 * the list, because its position depends on rows this view hasn't loaded.
 */
export function bumpConversationInPages(
  cache: ConversationListCache | undefined,
  conversationId: string,
  bump: LastMessageBump,
  unreadDelta = 0,
): ConversationListCache | undefined {
  if (!cache || cache.pages.length === 0) return cache;

  let found: ConversationListItem | undefined;
  for (const page of cache.pages) {
    found = page.data.find((r) => r.conversation_id === conversationId);
    if (found) break;
  }
  if (!found) return cache;

  const updated: ConversationListItem = {
    ...found,
    ...bump,
    unread_count: Math.max(0, found.unread_count + unreadDelta),
  };

  const alreadyFirst =
    cache.pages[0].data[0]?.conversation_id === conversationId;
  const unchanged =
    alreadyFirst &&
    updated.last_message_at === found.last_message_at &&
    updated.last_message_preview === found.last_message_preview &&
    updated.unread_count === found.unread_count;
  if (unchanged) return cache;

  // Drop it from wherever it was, then re-seat at the front of page 0.
  const stripped = cache.pages.map((page) => {
    const data = page.data.filter((r) => r.conversation_id !== conversationId);
    return data.length === page.data.length ? page : { ...page, data };
  });
  const pages = stripped.map((page, i) =>
    i === 0 ? { ...page, data: [updated, ...page.data] } : page,
  );
  return { ...cache, pages };
}

/**
 * The inbox preview line for a message, mirroring exactly what
 * `send_message` writes to `conversation.last_message_preview`:
 *
 *   left(coalesce(content, '[Photo]' | '[Attachment]'), 140)
 *
 * Kept here so the optimistic client-side bump renders the same string the
 * server will hand back on the next refetch, instead of flickering.
 */
export function conversationPreviewFor(message: {
  content?: string | null;
  message_type?: string | null;
}): string {
  const fallback =
    message.message_type === "image"
      ? "[Photo]"
      : message.message_type === "audio"
        ? "[Voice message]"
        : "[Attachment]";
  return (message.content ?? fallback).slice(0, 140);
}
