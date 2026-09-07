import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// Powers the Messages tab badge. A dedicated count endpoint (not derived
// from a fetched page) so it stays right on every screen. The realtime
// layer invalidates this key on any inbound message; the poll is the
// backstop for a dropped socket.
export function useUnreadMessageCount() {
  const { session } = useSession();

  return useQuery({
    queryKey: [...messagingKeys.unreadCount(), session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      const res = await api.messaging.unreadCount();
      return res.status === 200 ? (res.data?.count ?? 0) : 0;
    },
    staleTime: 20_000,
    refetchInterval: 45_000,
  });
}
