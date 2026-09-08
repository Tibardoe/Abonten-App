import { api } from "@/lib/api";
import type { NotificationType } from "@abonten/types/notificationType";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

const KEY = ["mobile", "notifications"] as const;
const COUNT_KEY = ["mobile", "notifications", "unread-count"] as const;

type Page = { data: NotificationType[] };
type Cache = InfiniteData<Page>;

export function useNotifications(options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: KEY,
    enabled: options?.enabled ?? true,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.notifications.list({ cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    // A notification list is append-only from the user's point of view and
    // the bell badge polls separately, so re-reading it on every mount was
    // pure waste. New rows still arrive via the badge poll + push handler.
    staleTime: 60_000,
  });
}

export function flattenNotifications(
  pages: { data?: NotificationType[] }[] | undefined,
): NotificationType[] {
  // Skip any error-envelope page ({ status, message }, no `data` array) so a
  // transient failure can't inject `undefined` into the list.
  return pages?.flatMap((p) => (Array.isArray(p.data) ? p.data : [])) ?? [];
}

// Stamp `read_at` on the rows already in the cache instead of refetching the
// list. Returns the same page reference when nothing in it changed, so only
// the page holding the row re-renders. Rows are identified by id, so this is
// safe to apply to a partially-loaded infinite list.
function markReadInCache(cache: Cache | undefined, ids: Set<string> | "all") {
  if (!cache) return cache;
  const now = new Date().toISOString();
  let hit = false;
  const pages = cache.pages.map((page) => {
    let pageHit = false;
    const data = page.data.map((n) => {
      if (n.read_at) return n;
      if (ids !== "all" && !ids.has(n.id)) return n;
      pageHit = true;
      hit = true;
      return { ...n, read_at: now };
    });
    return pageHit ? { ...page, data } : page;
  });
  return hit ? { ...cache, pages } : cache;
}

function setUnreadCount(
  qc: ReturnType<typeof useQueryClient>,
  update: (prev: number) => number,
) {
  qc.setQueriesData<number>({ queryKey: COUNT_KEY }, (prev) =>
    typeof prev === "number" ? Math.max(0, update(prev)) : prev,
  );
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onMutate: () => {
      const previous = qc.getQueryData<Cache>(KEY);
      const previousCount = qc.getQueryData<number>(COUNT_KEY);
      qc.setQueryData<Cache>(KEY, (c) => markReadInCache(c, "all"));
      setUnreadCount(qc, () => 0);
      return { previous, previousCount };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      qc.setQueryData(KEY, ctx.previous);
      if (typeof ctx.previousCount === "number") {
        setUnreadCount(qc, () => ctx.previousCount as number);
      }
    },
    // No invalidate: the optimistic state already matches what the server
    // wrote, and the badge poll is the backstop if a write silently failed.
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onMutate: (id) => {
      const previous = qc.getQueryData<Cache>(KEY);
      // Only move the badge if this row was actually unread — tapping an
      // already-read notification must not decrement anything.
      const wasUnread = (previous?.pages ?? []).some((p) =>
        p.data.some((n) => n.id === id && !n.read_at),
      );
      qc.setQueryData<Cache>(KEY, (c) => markReadInCache(c, new Set([id])));
      if (wasUnread) setUnreadCount(qc, (n) => n - 1);
      return { previous, wasUnread };
    },
    onError: (_e, _id, ctx) => {
      if (!ctx) return;
      qc.setQueryData(KEY, ctx.previous);
      if (ctx.wasUnread) setUnreadCount(qc, (n) => n + 1);
    },
  });
}
