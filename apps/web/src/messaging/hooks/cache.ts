import type { MessageRow } from "@abonten/types/messagingType";
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

// Insert (or replace, if already present by id / client_generated_id) a row
// at the newest end of the thread. Page 0 of the infinite query holds the
// newest messages. Used by both the optimistic send path and the realtime
// INSERT handler so a message never shows twice and never flickers on a
// refetch.
export function upsertMessageIntoCache(
  qc: QueryClient,
  conversationId: string,
  row: MessageRow,
): void {
  qc.setQueryData<MessagesCache>(
    messagingKeys.messages(conversationId),
    (old) => {
      if (!old || old.pages.length === 0) return old;
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
      const pages = old.pages.map((page, pi) =>
        pi === 0 ? { ...page, data: [row, ...page.data] } : page,
      );
      return { ...old, pages };
    },
  );
}
