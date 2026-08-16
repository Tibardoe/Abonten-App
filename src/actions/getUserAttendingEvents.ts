"use server";

import { createClient } from "@/config/supabase/server";
import type { PaginatedResult, SimpleCursor } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@/utils/pagination";

export default async function getUserAttendingEvents(options?: {
  status?: "active" | "cancelled";
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<UserTicketType>> {
  const supabase = await createClient();
  const status = options?.status ?? "active";
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error(userError?.message);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  let query = supabase
    .from("ticket")
    .select(
      `
      *,
      ticket_type:ticket_type_id (
        *,
        event:event_id (
          *,
          occurrences:event_occurrence (*)
        )
      )
    `,
    )
    .eq("user_id", user.id)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data: tickets, error: ticketsError } = await query;

  if (ticketsError) {
    console.error(
      `Error fetching user attending events: ${ticketsError.message}`,
    );

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const { page, hasNextPage } = splitPage<
    UserTicketType & { ticket_type: { event: UserTicketType["event"] } }
  >(tickets, pageSize);

  const ticketsWithEvents = page.map((ticket) => ({
    ...ticket,
    event: ticket.ticket_type.event,
  }));

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return {
    status: 200,
    data: ticketsWithEvents,
    nextCursor,
    hasNextPage,
  };
}
