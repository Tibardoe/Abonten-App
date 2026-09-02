"use server";

import { createClient } from "@/config/supabase/server";
import { fetchOrganizerLedgerPage } from "@abonten/services/organizer/organizerReadQuery";
import type { OrganizerLedgerTransactionRow } from "@abonten/types/organizerFinance";
import type { PaginatedResult } from "@abonten/types/pagination";

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

  return fetchOrganizerLedgerPage(supabase, options);
}
