"use client";

import getUserAttendingEventIds from "@/actions/getUserAttendingEventIds";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";

// Drives the "You're Going" corner badge on discovery event cards. One
// shared query per signed-in user (not per card) -- every EventCard on a
// page calls this hook, but React Query de-dupes them under the same
// ["attending-event-ids", userId] key into a single request, the same
// pattern useCurrentUser already relies on for its own shared cache.
export function useAttendingEventIds() {
  const { data: user } = useCurrentUser();

  const { data } = useQuery({
    queryKey: ["attending-event-ids", user?.id],
    queryFn: getUserAttendingEventIds,
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  return new Set(data?.status === 200 ? data.data : []);
}
