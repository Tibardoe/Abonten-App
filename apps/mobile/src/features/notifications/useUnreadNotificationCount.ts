import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// Powers the header bell badge. A dedicated count query (GET
// /api/mobile/notifications/unread-count) rather than deriving from a
// fetched page, so it stays accurate on every branded screen without
// pulling a full notifications page. Short staleTime + poll so a
// notification arriving server-side shows on the badge within ~30s.
export function useUnreadNotificationCount() {
  const { session } = useSession();

  return useQuery({
    queryKey: ["mobile", "notifications", "unread-count", session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      const res = await api.notifications.unreadCount();
      return res.status === 200 ? (res.data?.count ?? 0) : 0;
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}
