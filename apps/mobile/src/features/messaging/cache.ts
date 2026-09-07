import type { MessageRow } from "@abonten/api-client";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

type MessagesPage = { data: MessageRow[] };
type MessagesCache = InfiniteData<MessagesPage>;

function sameMessage(a: MessageRow, b: MessageRow): boolean {
  if (a.id === b.id) return true;
  return (
    a.client_generated_id != null &&
    a.client_generated_id === b.client_generated_id
  );
}

// Insert (or, if it's already there by id / client_generated_id, replace) a
// row at the newest end of the thread. Page 0 of the infinite query holds
// the newest messages, so "newest" means the front of pages[0].data. Used by
// both the optimistic send path and the realtime INSERT handler so a message
// never shows twice and never flickers on a refetch.
export function upsertMessageIntoCache(
  qc: QueryClient,
  conversationId: string,
  row: MessageRow,
): void {
  qc.setQueryData<MessagesCache>(
    messagingKeys.messages(conversationId),
    (old) => {
      if (!old || old.pages.length === 0) return old;
      // If the row is anywhere in the loaded set, replace it in place.
      for (let p = 0; p < old.pages.length; p++) {
        const idx = old.pages[p].data.findIndex((m) => sameMessage(m, row));
        if (idx !== -1) {
          const pages = old.pages.map((page, pi) =>
            pi === p
              ? {
                  ...page,
                  data: page.data.map((m, mi) => (mi === idx ? row : m)),
                }
              : page,
          );
          return { ...old, pages };
        }
      }
      // Otherwise prepend to page 0 (the newest page).
      const pages = old.pages.map((page, pi) =>
        pi === 0 ? { ...page, data: [row, ...page.data] } : page,
      );
      return { ...old, pages };
    },
  );
}

// Replace a single row already in the cache (edit / soft-delete). No-op if
// the row isn't loaded — the next refetch will pick the change up.
export function replaceMessageInCache(
  qc: QueryClient,
  conversationId: string,
  row: MessageRow,
): void {
  qc.setQueryData<MessagesCache>(
    messagingKeys.messages(conversationId),
    (old) => {
      if (!old) return old;
      let hit = false;
      const pages = old.pages.map((page) => ({
        ...page,
        data: page.data.map((m) => {
          if (sameMessage(m, row)) {
            hit = true;
            return row;
          }
          return m;
        }),
      }));
      return hit ? { ...old, pages } : old;
    },
  );
}
