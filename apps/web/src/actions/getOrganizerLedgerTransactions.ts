"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type { OrganizerLedgerTransactionRow } from "@abonten/types/organizerFinance";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";

/**
 * Paginated Finances > Transactions feed. Follows the exact same
 * cursor-pagination shape as getUserTransactionHistory.ts (fetch pageSize+1
 * rows from a cursor-aware RPC, splitPage locally) so an unbounded ledger
 * (thousands of rows for an active organizer) is never fetched in one page,
 * and this list can plug straight into the existing InfiniteList component.
 */
export async function getOrganizerLedgerTransactions(options?: {
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<OrganizerLedgerTransactionRow>> {
  const supabase = await createClient();
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  const { data: rows, error } = await supabase.rpc(
    "get_organizer_ledger_transactions",
    {
      p_cursor_created_at: cursor?.sortValue ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: pageSize + 1,
    },
  );

  if (error) {
    logger.error(`Failed fetching organizer transactions: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<OrganizerLedgerTransactionRow>(
    (rows ?? []) as OrganizerLedgerTransactionRow[],
    pageSize,
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: last.created_at,
          id: last.entry_id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}
