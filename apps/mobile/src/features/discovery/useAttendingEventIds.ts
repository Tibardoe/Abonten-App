import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

// Drives the "You're going" corner badge on discovery event cards — the
// native echo of the web getUserAttendingEventIds action: the set of event
// ids the signed-in user holds a live (active | used) ticket for. One
// shared query per user (React Query de-dupes every card's call under the
// same key), not one per card. `ticket` has owner-scoped RLS so this runs
// straight from the client.

const EMPTY = new Set<string>();

export function useAttendingEventIds(): Set<string> {
  const { session } = useSession();
  const userId = session?.user.id;

  const { data } = useQuery({
    queryKey: ["mobile", "attending-event-ids", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("ticket")
        .select("ticket_type:ticket_type_id(event_id)")
        .eq("user_id", userId as string)
        .in("status", ["active", "used"]);
      if (error) throw error;
      const ids = new Set<string>();
      for (const row of (rows ?? []) as unknown as {
        ticket_type: { event_id: string } | null;
      }[]) {
        if (row.ticket_type?.event_id) ids.add(row.ticket_type.event_id);
      }
      return ids;
    },
  });

  return data ?? EMPTY;
}
