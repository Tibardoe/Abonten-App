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
import { TICKET_REFUND_SELECT } from "@/utils/ticketSelect";

/**
 * Cancelled tickets that actually had money attached — the My Events
 * Refunds tab. Free/fully-discounted cancellations (no transaction, or a
 * transaction with amount 0) are deliberately excluded: cancelling those
 * never involved a monetary refund, so they belong in the Cancelled tab
 * only, not here. `transaction:transaction_id!inner` (TICKET_REFUND_SELECT)
 * is what makes both the "must have a transaction" and "amount > 0" filters
 * apply as row filters rather than embedding an empty/null relation.
 */
export default async function getUserTicketRefunds(options?: {
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<UserTicketType>> {
  const supabase = await createClient();
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
    .select(TICKET_REFUND_SELECT)
    .eq("user_id", user.id)
    .eq("status", "cancelled")
    .gt("transaction.amount", 0)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data: tickets, error: ticketsError } = await query;

  if (ticketsError) {
    console.error(
      `Error fetching user ticket refunds: ${ticketsError.message}`,
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

  const refundsWithEvents = page.map((ticket) => ({
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
    data: refundsWithEvents,
    nextCursor,
    hasNextPage,
  };
}
