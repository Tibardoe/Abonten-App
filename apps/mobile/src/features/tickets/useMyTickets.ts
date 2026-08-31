import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { keysetOlderThan } from "@abonten/core/pagination";
import { TICKET_WITH_EVENT_SELECT } from "@abonten/core/ticketSelect";
import type { UserTicketType } from "@abonten/types/ticketType";
import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;

type Cursor = { sortValue: string; id: string };
type Row = UserTicketType & {
  ticket_type: { event: UserTicketType["event"] };
};

async function fetchPage(
  userId: string,
  cursor: Cursor | null,
): Promise<{ tickets: UserTicketType[]; nextCursor: Cursor | null }> {
  let query = supabase
    .from("ticket")
    .select(TICKET_WITH_EVENT_SELECT)
    .eq("user_id", userId)
    .in("status", ["active", "used"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;
  if (error) throw error;

  const all = ((data ?? []) as unknown as Row[]).map((t) => ({
    ...t,
    event: t.ticket_type.event,
  }));
  const hasNext = all.length > PAGE_SIZE;
  const tickets = hasNext ? all.slice(0, PAGE_SIZE) : all;
  const last = tickets[tickets.length - 1];

  return {
    tickets,
    nextCursor:
      hasNext && last
        ? { sortValue: String(last.created_at), id: last.id }
        : null,
  };
}

// Direct `ticket` table read scoped by `.eq("user_id", …)` + RLS — the same
// query the getUserAttendingEvents Server Action's simple path runs. Cursor
// kept in memory (no encode/decode).
export function useMyTickets() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useInfiniteQuery({
    queryKey: ["mobile", "tickets", userId],
    enabled: !!userId,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(userId ?? "", pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
