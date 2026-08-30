"use server";

import { createClient } from "@/config/supabase/server";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import {
  type TransactionPeriod,
  getTransactionPeriodRange,
} from "@abonten/core/transactionsDateRange";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { UserTransactionRow } from "@abonten/types/transactions";

// Merged, paginated timeline across ticket_checkout + subscription_checkout
// (get_user_transaction_history RPC does the UNION ALL + keyset filter in
// SQL — see the migration for why pagination lives in the RPC rather than
// PostgREST's plain .or() keyset idiom used by single-table lists).
export async function getUserTransactionHistory(
  period: TransactionPeriod,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<UserTransactionRow>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: `Error fetching user: ${userError.message}`,
    };
  }

  if (!user.user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not authenticated",
    };
  }

  const { start, end } = getTransactionPeriodRange(period);

  const { data: rows, error } = await supabase.rpc(
    "get_user_transaction_history",
    {
      p_start: start ? start.toISOString() : null,
      p_end: end ? end.toISOString() : null,
      p_cursor_created_at: cursor?.sortValue ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: pageSize + 1,
    },
  );

  if (error) {
    throw error;
  }

  const { page, hasNextPage } = splitPage<UserTransactionRow>(
    (rows ?? []) as UserTransactionRow[],
    pageSize,
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: last.created_at,
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}
