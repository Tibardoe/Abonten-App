import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { getEventStatus } from "@abonten/core/eventStatus";
import { keysetOlderThan } from "@abonten/core/pagination";
import { TICKET_WITH_EVENT_SELECT } from "@abonten/core/ticketSelect";
import type { UserTicketType } from "@abonten/types/ticketType";
import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;

// The My-Tickets tab set — native echo of the web /manage/my-events tabs.
// `active` / `past` share the same status filter (`active` | `used`) and are
// split client-side by whether the event has ended (matching the web
// switcher); `cancelled` is its own status.
export type TicketFilter = "active" | "past" | "cancelled";

type Cursor = { sortValue: string; id: string };
type Row = UserTicketType & {
  ticket_type: { event: UserTicketType["event"] };
};

function statusesFor(filter: TicketFilter): string[] {
  return filter === "cancelled" ? ["cancelled"] : ["active", "used"];
}

function eventEnded(event: UserTicketType["event"]): boolean {
  return (
    getEventStatus(
      event?.starts_at,
      event?.ends_at,
      // biome-ignore lint/suspicious/noExplicitAny: occurrences shape varies by select
      (event as any)?.occurrences ?? (event as any)?.event_occurrence,
    ) === "ended"
  );
}

async function fetchPage(
  userId: string,
  filter: TicketFilter,
  cursor: Cursor | null,
): Promise<{ tickets: UserTicketType[]; nextCursor: Cursor | null }> {
  let query = supabase
    .from("ticket")
    .select(TICKET_WITH_EVENT_SELECT)
    .eq("user_id", userId)
    .in("status", statusesFor(filter))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;
  if (error) throw error;

  let all = ((data ?? []) as unknown as Row[]).map((t) => ({
    ...t,
    event: t.ticket_type.event,
  }));

  if (filter === "active") all = all.filter((t) => !eventEnded(t.event));
  if (filter === "past") all = all.filter((t) => eventEnded(t.event));

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

export function useMyTickets(filter: TicketFilter = "active") {
  const { session } = useSession();
  const userId = session?.user.id;

  return useInfiniteQuery({
    queryKey: ["mobile", "tickets", userId, filter],
    enabled: !!userId,
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchPage(userId ?? "", filter, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });
}
