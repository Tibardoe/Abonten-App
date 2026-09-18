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
 * Where the server puts a row: `list_conversations` orders by
 * `last_message_at desc nulls last, id desc`. True when `a` comes before `b`.
 * (Postgres compares uuids byte by byte, which for the lowercase hex form is
 * the same as comparing the strings.)
 */
function sortsBefore(
  a: ConversationListItem,
  b: ConversationListItem,
): boolean {
  const ta = a.last_message_at ? Date.parse(a.last_message_at) : Number.NaN;
  const tb = b.last_message_at ? Date.parse(b.last_message_at) : Number.NaN;
  const aNull = Number.isNaN(ta);
  const bNull = Number.isNaN(tb);
  if (aNull !== bNull) return bNull; // nulls last
  if (!aNull && ta !== tb) return ta > tb;
  return a.conversation_id > b.conversation_id;
}

/**
 * Apply a last-message bump (a new message, an edit of the latest one, or a
 * deletion that rolled the conversation back to its previous message) to the
 * cached inbox pages, and put the row where the server's ordering would.
 *
 * A new message moves the row to the top, as before. A deletion that moved
 * `last_message_at` BACKWARDS used to be re-seated at the top as well, so a
 * conversation whose newest message had just been deleted stayed first until
 * the next refetch; now it drops to its place among the loaded rows. If the
 * new position lies past every loaded row it goes at the end of what is
 * loaded -- the next page fetch or refetch then places it exactly.
 *
 * Returns the same cache reference when this view does not hold the row, or
 * when nothing about it -- fields or position -- changes.
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

  // Drop it from wherever it was...
  const stripped = cache.pages.map((page) => {
    const data = page.data.filter((r) => r.conversation_id !== conversationId);
    return data.length === page.data.length ? page : { ...page, data };
  });

  // ...then find the first loaded row it sorts before.
  let target: { page: number; index: number } | null = null;
  for (let p = 0; p < stripped.length && !target; p++) {
    const idx = stripped[p].data.findIndex((r) => sortsBefore(updated, r));
    if (idx >= 0) target = { page: p, index: idx };
  }
  if (!target) {
    const last = stripped.length - 1;
    target = { page: last, index: stripped[last].data.length };
  }

  // Same place and same fields: leave the cache untouched so no view
  // re-renders.
  const originalPage = cache.pages.findIndex((page) =>
    page.data.some((r) => r.conversation_id === conversationId),
  );
  const originalIndex = cache.pages[originalPage].data.findIndex(
    (r) => r.conversation_id === conversationId,
  );
  const samePlace =
    target.page === originalPage && target.index === originalIndex;
  const sameFields =
    updated.last_message_at === found.last_message_at &&
    updated.last_message_preview === found.last_message_preview &&
    updated.last_message_sender_id === found.last_message_sender_id &&
    updated.unread_count === found.unread_count;
  if (samePlace && sameFields) return cache;

  const { page: tp, index: ti } = target;
  const pages = stripped.map((page, i) => {
    if (i !== tp) return page;
    const data = [...page.data];
    data.splice(ti, 0, updated);
    return { ...page, data };
  });
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
