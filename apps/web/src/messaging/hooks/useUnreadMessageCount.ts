"use client";

import { getUnreadMessageCount } from "@/actions/getUnreadMessageCount";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQuery } from "@tanstack/react-query";
import { messagingKeys } from "./keys";

// Powers the Messages nav badge. A dedicated count action (not derived from
// a fetched page). The realtime layer invalidates this key on any inbound
// message; the poll is the backstop for a dropped socket.
export function useUnreadMessageCount() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: [...messagingKeys.unreadCount(), user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await getUnreadMessageCount();
      return res.status === 200 ? res.count : 0;
    },
    staleTime: 20_000,
    refetchInterval: 45_000,
  });
}
