import { api } from "@/lib/api";
import type { NotificationType } from "@abonten/types/notificationType";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

const KEY = ["mobile", "notifications"] as const;

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: KEY,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.notifications.list({ cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });
}

export function flattenNotifications(
  pages: { data: NotificationType[] }[] | undefined,
): NotificationType[] {
  return pages?.flatMap((p) => p.data) ?? [];
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
