"use client";

import { getUnreadNotificationCount } from "@/actions/getUnreadNotificationCount";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQuery } from "@tanstack/react-query";

// Powers the NotificationBell badge. Short staleTime (unlike
// useCurrentUser's 60s) since an unread count needs to feel reasonably
// live -- a new notification arriving server-side should show up on the
// badge within half a minute of the user sitting on any page, not only
// after a full remount.
export function useUnreadNotificationCount() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["unread-notification-count", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const result = await getUnreadNotificationCount();
      return result.status === 200 ? result.count : 0;
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}
